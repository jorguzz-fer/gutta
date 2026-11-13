import 'server-only';
import { and, asc, eq, inArray, isNull, schema as s, sql, withUser, type Tx } from '@gutta/db';
import { disciplines as contract } from '@gutta/contracts';
import type { z } from 'zod';
import { ApiError, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { toDto as fileDto } from '@/features/files/service';
import { flags } from '@/features/flags/service';
import {
  cancelImportsForFile,
  createImportForDocument,
  latestImports,
} from '@/features/schedule/service';

type Input = z.output<typeof contract.disciplineBody>;
type DisciplineDto = contract.DisciplineDto;

// Disciplinas do aluno (SPEC v2, DIS-01 a DIS-03). Usadas no passo do cadastro e na tela
// "Minhas disciplinas"; por isso valem com a chave "cadastro" ou com a chave "disciplinas".
export async function assertDisciplinesEnabled() {
  const on = await flags();
  if (!on.cadastro && !on.disciplinas) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

/** Semestre atual do aluno; cria na primeira vez. */
export async function currentTerm(tx: Tx, userId: string) {
  const term = await tx.query.studentTerms.findFirst({
    where: and(eq(s.studentTerms.ownerId, userId), eq(s.studentTerms.isCurrent, true)),
  });
  if (term) return term;
  const [created] = await tx
    .insert(s.studentTerms)
    .values({ ownerId: userId, label: 'Semestre atual' })
    .onConflictDoNothing()
    .returning();
  return (
    created ??
    (await tx.query.studentTerms.findFirst({
      where: and(eq(s.studentTerms.ownerId, userId), eq(s.studentTerms.isCurrent, true)),
    }))!
  );
}

async function load(tx: Tx, userId: string, ids?: string[]): Promise<DisciplineDto[]> {
  const term = await currentTerm(tx, userId);
  const rows = await tx
    .select()
    .from(s.enrolledDisciplines)
    .where(
      and(
        eq(s.enrolledDisciplines.ownerId, userId),
        eq(s.enrolledDisciplines.termId, term.id),
        isNull(s.enrolledDisciplines.archivedAt),
        ids ? inArray(s.enrolledDisciplines.id, ids) : undefined,
      ),
    )
    .orderBy(asc(s.enrolledDisciplines.createdAt));
  if (rows.length === 0) return [];
  const discIds = rows.map((r) => r.id);
  const teachers = await tx
    .select()
    .from(s.disciplineTeachers)
    .where(inArray(s.disciplineTeachers.disciplineId, discIds))
    .orderBy(asc(s.disciplineTeachers.createdAt));
  const docs = await tx
    .select({ doc: s.disciplineDocuments, file: s.files })
    .from(s.disciplineDocuments)
    .innerJoin(s.files, eq(s.files.id, s.disciplineDocuments.fileId))
    .where(inArray(s.disciplineDocuments.disciplineId, discIds))
    .orderBy(asc(s.disciplineDocuments.createdAt));
  const imports = await latestImports(tx, userId, discIds);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.shortName,
    color: r.color,
    teachers: teachers
      .filter((t) => t.disciplineId === r.id)
      .map((t) => ({ id: t.id, name: t.name })),
    documents: docs
      .filter((d) => d.doc.disciplineId === r.id)
      .map((d) => ({ id: d.doc.id, kind: d.doc.kind, file: fileDto(d.file) })),
    scheduleImport: (() => {
      const i = imports.get(r.id);
      return i ? { id: i.id, status: i.status, error: i.error } : null;
    })(),
  }));
}

async function findOwn(tx: Tx, userId: string, id: string) {
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(
      eq(s.enrolledDisciplines.id, id),
      eq(s.enrolledDisciplines.ownerId, userId),
      isNull(s.enrolledDisciplines.archivedAt),
    ),
  });
  if (!d) throw notFound('Disciplina');
  return d;
}

async function setTeachers(tx: Tx, userId: string, disciplineId: string, names: string[]) {
  const key = (n: string) => n.toLocaleLowerCase('pt-BR');
  const seen = new Set<string>();
  // Mesmo nome com caixa diferente conta uma vez; vale a primeira grafia.
  const unique = names.filter((n) => {
    if (seen.has(key(n))) return false;
    seen.add(key(n));
    return true;
  });
  // Quem continua na lista mantém o id: aulas importadas apontam para ele.
  const current = await tx
    .select()
    .from(s.disciplineTeachers)
    .where(eq(s.disciplineTeachers.disciplineId, disciplineId));
  const gone = current.filter((t) => !seen.has(key(t.name)));
  if (gone.length)
    await tx.delete(s.disciplineTeachers).where(
      inArray(
        s.disciplineTeachers.id,
        gone.map((t) => t.id),
      ),
    );
  for (const name of unique) {
    const same = current.find((t) => key(t.name) === key(name));
    if (!same)
      await tx.insert(s.disciplineTeachers).values({ ownerId: userId, disciplineId, name });
    else if (same.name !== name)
      await tx
        .update(s.disciplineTeachers)
        .set({ name })
        .where(eq(s.disciplineTeachers.id, same.id));
  }
}

function duplicateName(err: unknown) {
  const c = (err as { cause?: { code?: string; constraint?: string } }).cause;
  return c?.code === '23505' && c.constraint === 'enrolled_disciplines_name_uq';
}

export async function listDisciplines(userId: string) {
  await assertDisciplinesEnabled();
  return { items: await withUser(db(), userId, (tx) => load(tx, userId)) };
}

export async function createDiscipline(userId: string, input: Input) {
  await assertDisciplinesEnabled();
  try {
    const discipline = await withUser(db(), userId, async (tx) => {
      const term = await currentTerm(tx, userId);
      const [row] = await tx
        .insert(s.enrolledDisciplines)
        .values({
          ownerId: userId,
          termId: term.id,
          name: input.name,
          shortName: input.shortName,
          color: input.color,
        })
        .returning();
      await setTeachers(tx, userId, row!.id, input.teachers);
      return (await load(tx, userId, [row!.id]))[0]!;
    });
    return { discipline };
  } catch (err) {
    if (duplicateName(err)) throw conflict('Você já tem uma disciplina com esse nome.');
    throw err;
  }
}

export async function updateDiscipline(userId: string, id: string, input: Input) {
  await assertDisciplinesEnabled();
  try {
    const discipline = await withUser(db(), userId, async (tx) => {
      await findOwn(tx, userId, id);
      await tx
        .update(s.enrolledDisciplines)
        .set({ name: input.name, shortName: input.shortName, color: input.color })
        .where(eq(s.enrolledDisciplines.id, id));
      await setTeachers(tx, userId, id, input.teachers);
      return (await load(tx, userId, [id]))[0]!;
    });
    return { discipline };
  } catch (err) {
    if (duplicateName(err)) throw conflict('Você já tem uma disciplina com esse nome.');
    throw err;
  }
}

/** Arquiva: some da lista do semestre, mas o histórico e os arquivos ficam. */
export async function removeDiscipline(userId: string, id: string) {
  await assertDisciplinesEnabled();
  await withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    await tx
      .update(s.enrolledDisciplines)
      .set({ archivedAt: sql`now()` })
      .where(eq(s.enrolledDisciplines.id, id));
  });
  return { ok: true as const };
}

export async function attachDocument(
  userId: string,
  id: string,
  input: { kind: 'cronograma' | 'plano_ensino'; fileId: string },
) {
  await assertDisciplinesEnabled();
  const discipline = await withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    const file = await tx.query.files.findFirst({
      where: and(eq(s.files.id, input.fileId), eq(s.files.ownerId, userId)),
    });
    if (!file) throw notFound('Arquivo');
    if (!(contract.SCHEDULE_MIME as readonly string[]).includes(file.mime)) {
      throw new ApiError(400, 'invalid_request', 'Envie o documento em PDF, DOC, DOCX ou XLSX.');
    }
    if (file.sizeBytes > contract.MAX_SCHEDULE_BYTES) {
      throw new ApiError(400, 'invalid_request', 'O documento passa de 10 MB.');
    }
    await tx
      .insert(s.disciplineDocuments)
      .values({ ownerId: userId, disciplineId: id, fileId: input.fileId, kind: input.kind })
      .onConflictDoNothing();
    // Cronograma anexado: a IA lê e o aluno confere depois (DIS-05).
    if (input.kind === 'cronograma') await createImportForDocument(tx, userId, id, file);
    return (await load(tx, userId, [id]))[0]!;
  });
  return { discipline };
}

export async function detachDocument(userId: string, id: string, documentId: string) {
  await assertDisciplinesEnabled();
  const discipline = await withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    const deleted = await tx
      .delete(s.disciplineDocuments)
      .where(
        and(
          eq(s.disciplineDocuments.id, documentId),
          eq(s.disciplineDocuments.disciplineId, id),
          eq(s.disciplineDocuments.ownerId, userId),
        ),
      )
      .returning({ id: s.disciplineDocuments.id, fileId: s.disciplineDocuments.fileId });
    if (deleted.length === 0) throw notFound('Documento');
    await cancelImportsForFile(tx, userId, id, deleted[0]!.fileId);
    return (await load(tx, userId, [id]))[0]!;
  });
  return { discipline };
}

/** Quantas disciplinas o aluno tem no semestre atual (o cadastro exige pelo menos uma). */
export async function disciplineCount(tx: Tx, userId: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.enrolledDisciplines)
    .innerJoin(s.studentTerms, eq(s.studentTerms.id, s.enrolledDisciplines.termId))
    .where(
      and(
        eq(s.enrolledDisciplines.ownerId, userId),
        eq(s.studentTerms.isCurrent, true),
        isNull(s.enrolledDisciplines.archivedAt),
      ),
    );
  return r?.n ?? 0;
}
