import 'server-only';
import {
  diffSchedule,
  localDayKey,
  normalizeScheduleItem,
  parseHm,
  scheduleItemErrors,
  scheduleTarget,
  textSimilarity,
  zonedTimeToUtc,
  type ImportedEvent,
  type ScheduleItem,
} from '@gutta/core';
import { schedule as contract } from '@gutta/contracts';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { emit } from '@gutta/jobs';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { assertDisciplinesEnabled } from '@/features/academics/service';
import { latestConsent, recordConsents } from '@/features/privacy/consent';
import { syncAcademicAlerts } from '@/features/notifications/service';

// Importação do cronograma (SPEC v2, DIS-05, DIS-07 e CAL-06). A IA lê no worker
// (ai.extract_schedule); aqui o aluno confere e confirma. Nada entra na agenda antes disso.

type ImportRow = typeof s.scheduleImports.$inferSelect;
type FileRow = typeof s.files.$inferSelect;
type Dto = contract.ScheduleImportDto;

// O que o worker grava em `extracted` (formato de @gutta/ai). Lido com folga: item fora do
// formato é descartado em vez de quebrar a tela.
const Extracted = z.object({
  events: z.array(z.unknown()).default([]),
  warnings: z.array(z.string()).default([]),
});

function extractedItems(row: ImportRow): { items: contract.ExtractedItem[]; warnings: string[] } {
  const parsed = Extracted.safeParse(row.extracted ?? {});
  if (!parsed.success) return { items: [], warnings: [] };
  const items: contract.ExtractedItem[] = [];
  for (const e of parsed.data.events) {
    const item = contract.ExtractedItem.safeParse(e);
    if (item.success) items.push(item.data);
  }
  return { items, warnings: parsed.data.warnings };
}

/** Eventos importados antes na disciplina, no formato da comparação. */
async function importedEvents(tx: Tx, userId: string, disciplineId: string) {
  const lessons = await tx
    .select()
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.ownerId, userId),
        eq(s.lessons.disciplineId, disciplineId),
        // Aula que o aluno tirou da agenda continua aqui como editada por ele: o próximo
        // cronograma não a traz de volta (DIS-07).
        eq(s.lessons.origin, 'imported'),
      ),
    )
    .orderBy(asc(s.lessons.startsAt));
  const assessments = await tx
    .select()
    .from(s.assessments)
    .where(
      and(
        eq(s.assessments.ownerId, userId),
        eq(s.assessments.disciplineId, disciplineId),
        eq(s.assessments.origin, 'imported'),
      ),
    )
    .orderBy(asc(s.assessments.dueAt));
  const out: ImportedEvent[] = [];
  for (const l of lessons) {
    const original = contract.ScheduleItem.safeParse(l.original);
    if (original.success)
      out.push({
        id: l.id,
        table: 'lesson',
        original: original.data,
        modifiedByStudent: l.modifiedByStudent || l.cancelledAt !== null,
      });
  }
  for (const a of assessments) {
    const original = contract.ScheduleItem.safeParse(a.original);
    if (original.success)
      out.push({
        id: a.id,
        table: 'assessment',
        original: original.data,
        // Avaliação com nota lançada também não se mexe sozinha.
        modifiedByStudent: a.modifiedByStudent || a.grade !== null,
      });
  }
  return out;
}

async function toDto(tx: Tx, userId: string, row: ImportRow): Promise<Dto> {
  const [meta] = await tx
    .select({ disciplineName: s.enrolledDisciplines.name, fileName: s.files.originalName })
    .from(s.enrolledDisciplines)
    .innerJoin(s.files, eq(s.files.id, row.fileId))
    .where(eq(s.enrolledDisciplines.id, row.disciplineId));
  const { items, warnings } = extractedItems(row);
  return {
    id: row.id,
    disciplineId: row.disciplineId,
    disciplineName: meta?.disciplineName ?? '',
    fileId: row.fileId,
    fileName: meta?.fileName ?? '',
    status: row.status,
    error: row.error,
    referenceYear: row.referenceYear,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    items: row.status === 'ready' ? items : null,
    warnings,
    existing: row.status === 'ready' ? await importedEvents(tx, userId, row.disciplineId) : [],
  };
}

async function findOwn(tx: Tx, userId: string, id: string, lock = false) {
  const q = tx
    .select()
    .from(s.scheduleImports)
    .where(and(eq(s.scheduleImports.id, id), eq(s.scheduleImports.ownerId, userId)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw notFound('Leitura do cronograma');
  return row;
}

/** Estado inicial conforme o arquivo e a autorização; enfileira a leitura quando der. */
async function start(tx: Tx, userId: string, importId: string, file: FileRow) {
  const consent = await latestConsent(tx, userId, 'ai_materials');
  let patch: Partial<ImportRow>;
  if (consent?.granted !== true) patch = { status: 'needs_consent', error: null };
  else if (file.status === 'ready' || file.status === 'failed' || file.status === 'quarantined')
    patch = { status: 'extracting', error: null };
  else patch = { status: 'waiting_file', error: null };
  await tx.update(s.scheduleImports).set(patch).where(eq(s.scheduleImports.id, importId));
  if (patch.status === 'extracting') await emit(tx, 'ai.extract_schedule', { importId, userId });
}

/**
 * Cronograma anexado à disciplina (chamado de attachDocument, na mesma transação). Uma
 * leitura em aberto da mesma disciplina é substituída pela nova.
 */
export async function createImportForDocument(
  tx: Tx,
  userId: string,
  disciplineId: string,
  file: FileRow,
) {
  const existing = await tx.query.scheduleImports.findFirst({
    where: and(
      eq(s.scheduleImports.ownerId, userId),
      eq(s.scheduleImports.fileId, file.id),
      eq(s.scheduleImports.disciplineId, disciplineId),
      ne(s.scheduleImports.status, 'rejected'),
    ),
  });
  if (existing) return existing.id; // o mesmo arquivo anexado de novo
  await tx
    .update(s.scheduleImports)
    .set({ status: 'rejected' })
    .where(
      and(
        eq(s.scheduleImports.ownerId, userId),
        eq(s.scheduleImports.disciplineId, disciplineId),
        inArray(s.scheduleImports.status, [
          'waiting_file',
          'needs_consent',
          'extracting',
          'ready',
          'failed',
        ]),
      ),
    );
  const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const year = Number(
    localDayKey(new Date(), profile?.timezone ?? 'America/Sao_Paulo').slice(0, 4),
  );
  const [row] = await tx
    .insert(s.scheduleImports)
    .values({ ownerId: userId, disciplineId, fileId: file.id, referenceYear: year })
    .returning();
  await start(tx, userId, row!.id, file);
  return row!.id;
}

/** Cronograma desanexado: leitura ainda não confirmada deixa de valer. */
export async function cancelImportsForFile(
  tx: Tx,
  userId: string,
  disciplineId: string,
  fileId: string,
) {
  await tx
    .update(s.scheduleImports)
    .set({ status: 'rejected' })
    .where(
      and(
        eq(s.scheduleImports.ownerId, userId),
        eq(s.scheduleImports.disciplineId, disciplineId),
        eq(s.scheduleImports.fileId, fileId),
        ne(s.scheduleImports.status, 'confirmed'),
      ),
    );
}

/** Última leitura (não descartada) de cada disciplina, para o cartão. */
export async function latestImports(tx: Tx, userId: string, disciplineIds: string[]) {
  if (disciplineIds.length === 0) return new Map<string, ImportRow>();
  const rows = await tx
    .select()
    .from(s.scheduleImports)
    .where(
      and(
        eq(s.scheduleImports.ownerId, userId),
        inArray(s.scheduleImports.disciplineId, disciplineIds),
        ne(s.scheduleImports.status, 'rejected'),
      ),
    )
    .orderBy(desc(s.scheduleImports.createdAt));
  const out = new Map<string, ImportRow>();
  for (const r of rows) if (!out.has(r.disciplineId)) out.set(r.disciplineId, r);
  return out;
}

export async function getImport(userId: string, id: string) {
  await assertDisciplinesEnabled();
  return withUser(db(), userId, async (tx) => ({
    import: await toDto(tx, userId, await findOwn(tx, userId, id)),
  }));
}

export async function rejectImport(userId: string, id: string) {
  await assertDisciplinesEnabled();
  return withUser(db(), userId, async (tx) => {
    const row = await findOwn(tx, userId, id, true);
    if (row.status === 'confirmed') throw conflict('Este cronograma já foi confirmado.');
    const [updated] = await tx
      .update(s.scheduleImports)
      .set({ status: 'rejected' })
      .where(eq(s.scheduleImports.id, id))
      .returning();
    return { import: await toDto(tx, userId, updated!) };
  });
}

export async function retryImport(userId: string, id: string, opts: { grantConsent: boolean }) {
  await assertDisciplinesEnabled();
  return withUser(db(), userId, async (tx) => {
    const row = await findOwn(tx, userId, id, true);
    if (row.status !== 'failed' && row.status !== 'needs_consent')
      throw conflict('Esta leitura não precisa ser refeita.');
    if (opts.grantConsent) await recordConsents(tx, userId, { ai_materials: true });
    const file = await tx.query.files.findFirst({
      where: and(eq(s.files.id, row.fileId), eq(s.files.ownerId, userId)),
    });
    if (!file) throw notFound('Arquivo');
    await start(tx, userId, id, file);
    return { import: await toDto(tx, userId, await findOwn(tx, userId, id)) };
  });
}

type ConfirmResult = { added: number; changed: number; removed: number; kept: number };

/** Nome igual (sem acento e caixa) ou quase: reaproveita; senão cria. */
async function upsertByName(
  tx: Tx,
  table: typeof s.disciplineTeachers | typeof s.disciplineTopics,
  cache: { id: string; name: string }[],
  userId: string,
  disciplineId: string,
  name: string | null,
) {
  if (!name) return null;
  const found = cache.find((c) => textSimilarity(c.name, name) >= 0.85);
  if (found) return found.id;
  const [row] = await tx
    .insert(table)
    .values({ ownerId: userId, disciplineId, name })
    .returning({ id: table.id, name: table.name });
  cache.push(row!);
  return row!.id;
}

/**
 * Confirmação (DIS-05, DIS-07). Compara os itens conferidos com o que veio de cronogramas
 * anteriores: inclui o novo, altera o que mudou, remove o que saiu. Evento editado pelo aluno
 * fica como ele deixou (só o registro original é atualizado). Confirmar de novo devolve o
 * mesmo resultado, sem mexer na agenda.
 */
export async function confirmImport(userId: string, id: string, rawItems: ScheduleItem[]) {
  await assertDisciplinesEnabled();
  const items = rawItems.map(normalizeScheduleItem);
  const invalid = items
    .map((item, index) => ({ index, errors: scheduleItemErrors(item) }))
    .filter((x) => x.errors.length > 0);
  if (invalid.length)
    throw badRequest('Há itens com data ou horário inválido.', { items: invalid });

  return withUser(db(), userId, async (tx) => {
    const row = await findOwn(tx, userId, id, true);
    if (row.status === 'confirmed') {
      const result = (row.confirmed as { result?: ConfirmResult } | null)?.result;
      return {
        import: await toDto(tx, userId, row),
        result: result ?? { added: 0, changed: 0, removed: 0, kept: 0 },
      };
    }
    if (row.status !== 'ready') throw conflict('Esta leitura não está pronta para confirmar.');
    const discipline = await tx.query.enrolledDisciplines.findFirst({
      where: and(
        eq(s.enrolledDisciplines.id, row.disciplineId),
        eq(s.enrolledDisciplines.ownerId, userId),
        isNull(s.enrolledDisciplines.archivedAt),
      ),
    });
    if (!discipline) throw notFound('Disciplina');
    const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const tz = profile?.timezone ?? 'America/Sao_Paulo';

    const teachers = await tx
      .select({ id: s.disciplineTeachers.id, name: s.disciplineTeachers.name })
      .from(s.disciplineTeachers)
      .where(eq(s.disciplineTeachers.disciplineId, discipline.id));
    const topics = await tx
      .select({ id: s.disciplineTopics.id, name: s.disciplineTopics.name })
      .from(s.disciplineTopics)
      .where(eq(s.disciplineTopics.disciplineId, discipline.id));

    const at = (item: ScheduleItem, hm: string | null) => {
      const t = hm ? parseHm(hm) : null;
      return zonedTimeToUtc(item.date, tz, t?.hour ?? 0, t?.minute ?? 0);
    };
    const lessonValues = async (item: ScheduleItem) => ({
      kind: scheduleTarget(item.type).kind as 'aula' | 'pratica' | 'outro',
      title: item.title,
      startsAt: at(item, item.start),
      endsAt: item.start && item.end ? at(item, item.end) : null,
      allDay: !item.start,
      location: item.location,
      teacherId: await upsertByName(
        tx,
        s.disciplineTeachers,
        teachers,
        userId,
        discipline.id,
        item.teacher,
      ),
      topicId: await upsertByName(
        tx,
        s.disciplineTopics,
        topics,
        userId,
        discipline.id,
        item.topic,
      ),
      original: item,
      importId: id,
    });
    const assessmentValues = (item: ScheduleItem) => ({
      kind: scheduleTarget(item.type).kind as 'prova' | 'atividade' | 'entrega',
      name: item.title,
      dueAt: at(item, item.start),
      allDay: !item.start,
      topicNote: item.topic,
      original: item,
      importId: id,
    });

    const diff = diffSchedule(await importedEvents(tx, userId, discipline.id), items);
    const result: ConfirmResult = { added: 0, changed: 0, removed: 0, kept: 0 };

    for (const item of diff.added) {
      if (scheduleTarget(item.type).table === 'lesson')
        await tx.insert(s.lessons).values({
          ownerId: userId,
          disciplineId: discipline.id,
          origin: 'imported',
          ...(await lessonValues(item)),
        });
      else
        await tx.insert(s.assessments).values({
          ownerId: userId,
          disciplineId: discipline.id,
          origin: 'imported',
          ...assessmentValues(item),
        });
      result.added++;
    }
    for (const c of [
      ...diff.changed,
      ...diff.unchanged.map((u) => ({ ...u, keepStudent: true })),
    ]) {
      const keep = c.keepStudent;
      // Mantido: só o registro original acompanha o cronograma novo.
      if (c.event.table === 'lesson')
        await tx
          .update(s.lessons)
          .set(keep ? { original: c.next, importId: id } : await lessonValues(c.next))
          .where(eq(s.lessons.id, c.event.id));
      else
        await tx
          .update(s.assessments)
          .set(keep ? { original: c.next, importId: id } : assessmentValues(c.next))
          .where(eq(s.assessments.id, c.event.id));
    }
    result.changed = diff.changed.filter((c) => !c.keepStudent).length;
    result.kept =
      diff.changed.filter((c) => c.keepStudent).length +
      diff.removed.filter((r) => r.keepStudent).length;
    for (const r of diff.removed) {
      if (r.keepStudent) continue;
      if (r.event.table === 'lesson')
        await tx.delete(s.lessons).where(eq(s.lessons.id, r.event.id));
      else await tx.delete(s.assessments).where(eq(s.assessments.id, r.event.id));
      result.removed++;
    }

    // Avisos de aula e prova acompanham a agenda nova (LEM-15).
    await syncAcademicAlerts(tx, userId);
    const [updated] = await tx
      .update(s.scheduleImports)
      .set({ status: 'confirmed', confirmed: { items, result }, confirmedAt: sql`now()` })
      .where(eq(s.scheduleImports.id, id))
      .returning();
    return { import: await toDto(tx, userId, updated!), result };
  });
}
