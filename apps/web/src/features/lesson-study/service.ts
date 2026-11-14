import 'server-only';
import { localDayKey, matchPages, reviewPriority } from '@gutta/core';
import type { lessonStudy as contract } from '@gutta/contracts';
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
import type { z } from 'zod';
import { ApiError, badRequest, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { toDto as fileDto } from '@/features/files/service';
import { flags } from '@/features/flags/service';
import { requestTask } from '@/features/planning/service';

// Acompanhar Aula (SPEC v2, 5.7; ADR 0015). Marcações por página com histórico, caderno,
// selos, dúvidas e conclusão da aula. Tudo como o dono (withUser), com o filtro do dono
// explícito, além do RLS.

type Layer = contract.Shape[];
type AnnotationRow = typeof s.slideAnnotations.$inferSelect;
type MarkRow = typeof s.contentMarks.$inferSelect;

const COPY_EVERY_MS = 10 * 60_000;
const HISTORY_KEEP = 50;

export async function assertLessonStudyEnabled() {
  const on = await flags();
  if (!on.aula) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function tzOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

const hm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

/** JSON com chaves em ordem: o jsonb do Postgres não guarda a ordem das chaves. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

async function ownLesson(tx: Tx, userId: string, lessonId: string) {
  const l = await tx.query.lessons.findFirst({
    where: and(eq(s.lessons.id, lessonId), eq(s.lessons.ownerId, userId)),
  });
  if (!l) throw notFound('Aula');
  return l;
}

/** Versão do material do próprio aluno; confere também que a versão é desse material. */
async function ownVersion(tx: Tx, userId: string, materialId: string, versionId: string) {
  const [row] = await tx
    .select({ v: s.materialVersions, f: s.files, m: s.materials })
    .from(s.materialVersions)
    .innerJoin(s.files, eq(s.files.id, s.materialVersions.fileId))
    .innerJoin(s.materials, eq(s.materials.id, s.materialVersions.materialId))
    .where(
      and(
        eq(s.materialVersions.id, versionId),
        eq(s.materialVersions.materialId, materialId),
        eq(s.materialVersions.ownerId, userId),
      ),
    );
  if (!row) throw notFound('Material');
  return row;
}

async function currentVersion(tx: Tx, userId: string, materialId: string) {
  const [row] = await tx
    .select({ v: s.materialVersions, f: s.files, m: s.materials })
    .from(s.materialVersions)
    .innerJoin(s.files, eq(s.files.id, s.materialVersions.fileId))
    .innerJoin(s.materials, eq(s.materials.id, s.materialVersions.materialId))
    .where(
      and(eq(s.materialVersions.materialId, materialId), eq(s.materialVersions.ownerId, userId)),
    )
    .orderBy(desc(s.materialVersions.version))
    .limit(1);
  if (!row) throw notFound('Material');
  return row;
}

function checkPage(page: number, pageCount: number | null) {
  if (pageCount && page > pageCount) throw badRequest('Esta página não existe no arquivo.');
}

const annotationDto = (a: AnnotationRow): contract.AnnotationDto => ({
  page: a.page,
  versionId: a.versionId,
  layer: a.layer as Layer,
  revision: a.revision,
  hidden: a.hidden,
  updatedAt: a.updatedAt.toISOString(),
});

const markDto = (m: MarkRow): contract.MarkDto => ({
  id: m.id,
  targetType: m.targetType,
  lessonId: m.lessonId,
  materialId: m.materialId,
  versionId: m.versionId,
  page: m.page,
  region: m.region ?? null,
  entryId: m.entryId,
  topicId: m.topicId,
  importance: m.importance,
  difficulty: m.difficulty,
  doubt: m.doubt,
  doubtResolved: Boolean(m.doubtResolvedAt),
  priority: reviewPriority({
    importance: m.importance,
    difficulty: m.difficulty,
    doubt: m.doubt,
    doubtResolved: Boolean(m.doubtResolvedAt),
  }),
});

async function pushHistory(tx: Tx, userId: string, a: AnnotationRow, reason: string) {
  await tx.insert(s.slideAnnotationHistory).values({
    ownerId: userId,
    annotationId: a.id,
    revision: a.revision,
    layer: a.layer,
    reason,
  });
  // Ficam as últimas HISTORY_KEEP cópias.
  await tx.execute(sql`
    delete from slide_annotation_history
    where annotation_id = ${a.id} and owner_id = ${userId} and id not in (
      select id from slide_annotation_history where annotation_id = ${a.id}
      order by saved_at desc limit ${HISTORY_KEEP})
  `);
}

/** Uma cópia a cada 10 minutos de edição, para o histórico com recuperação (AUL-12). */
async function dueForCopy(tx: Tx, a: AnnotationRow) {
  const last = await tx.query.slideAnnotationHistory.findFirst({
    where: eq(s.slideAnnotationHistory.annotationId, a.id),
    orderBy: desc(s.slideAnnotationHistory.savedAt),
  });
  const since = last?.savedAt ?? a.createdAt;
  return Date.now() - since.getTime() >= COPY_EVERY_MS;
}

// ---------------------------------------------------------------------------------------------
// Página da aula

function moment(start: Date, end: Date | null, allDay: boolean): 'antes' | 'durante' | 'depois' {
  const now = Date.now();
  const finish = end ?? new Date(start.getTime() + (allDay ? 24 : 2) * 3_600_000);
  if (now < start.getTime()) return 'antes';
  if (now <= finish.getTime()) return 'durante';
  return 'depois';
}

const emptyProgress: contract.ProgressDto = {
  attended: null,
  overallDifficulty: null,
  understoodGoals: false,
  hasDoubts: false,
  wantsReview: false,
  concludedAt: null,
  lastMaterialId: null,
  lastPage: null,
};

function progressDto(p: typeof s.lessonProgress.$inferSelect | undefined): contract.ProgressDto {
  if (!p) return emptyProgress;
  return {
    attended: p.attended,
    overallDifficulty: p.overallDifficulty,
    understoodGoals: p.understoodGoals,
    hasDoubts: p.hasDoubts,
    wantsReview: p.wantsReview,
    concludedAt: p.concludedAt?.toISOString() ?? null,
    lastMaterialId: p.lastMaterialId,
    lastPage: p.lastPage,
  };
}

/** Notas com o título da aula e do material e a importância do slide de origem. */
async function notesWhere(tx: Tx, userId: string, where: ReturnType<typeof and>, tz: string) {
  const rows = await tx
    .select({
      n: s.notebookEntries,
      lessonTitle: s.lessons.title,
      lessonAt: s.lessons.startsAt,
      materialTitle: s.materials.title,
      importance: s.contentMarks.importance,
    })
    .from(s.notebookEntries)
    .leftJoin(s.lessons, eq(s.lessons.id, s.notebookEntries.lessonId))
    .leftJoin(s.materials, eq(s.materials.id, s.notebookEntries.materialId))
    .leftJoin(
      s.contentMarks,
      and(
        eq(s.contentMarks.targetType, 'slide'),
        eq(s.contentMarks.versionId, s.notebookEntries.versionId),
        eq(s.contentMarks.page, s.notebookEntries.page),
      ),
    )
    .where(and(eq(s.notebookEntries.ownerId, userId), where))
    .orderBy(
      asc(s.lessons.startsAt),
      asc(s.notebookEntries.page),
      asc(s.notebookEntries.createdAt),
    );
  return rows.map((r): contract.NoteDto => ({
    id: r.n.id,
    disciplineId: r.n.disciplineId,
    lessonId: r.n.lessonId,
    lessonTitle: r.lessonTitle ?? null,
    lessonDate: r.lessonAt ? localDayKey(r.lessonAt, tz) : null,
    materialId: r.n.materialId,
    materialTitle: r.materialTitle ?? null,
    versionId: r.n.versionId,
    page: r.n.page,
    region: r.n.region ?? null,
    text: r.n.content.text,
    revision: r.n.revision,
    importance: r.importance ?? null,
    createdAt: r.n.createdAt.toISOString(),
    updatedAt: r.n.updatedAt.toISOString(),
  }));
}

export async function getLessonStudy(
  userId: string,
  lessonId: string,
): Promise<contract.LessonStudyDto> {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await tzOf(tx, userId);
    const [row] = await tx
      .select({
        l: s.lessons,
        discipline: s.enrolledDisciplines.name,
        topic: s.disciplineTopics.name,
        teacher: s.disciplineTeachers.name,
      })
      .from(s.lessons)
      .innerJoin(s.enrolledDisciplines, eq(s.enrolledDisciplines.id, s.lessons.disciplineId))
      .leftJoin(s.disciplineTopics, eq(s.disciplineTopics.id, s.lessons.topicId))
      .leftJoin(s.disciplineTeachers, eq(s.disciplineTeachers.id, s.lessons.teacherId))
      .where(and(eq(s.lessons.id, lessonId), eq(s.lessons.ownerId, userId)));
    if (!row) throw notFound('Aula');
    const l = row.l;

    const mats = await tx
      .selectDistinctOn([s.materials.id], { m: s.materials, v: s.materialVersions, f: s.files })
      .from(s.materials)
      .innerJoin(s.materialLinks, eq(s.materialLinks.materialId, s.materials.id))
      .innerJoin(s.materialVersions, eq(s.materialVersions.materialId, s.materials.id))
      .innerJoin(s.files, eq(s.files.id, s.materialVersions.fileId))
      .where(
        and(
          eq(s.materials.ownerId, userId),
          isNull(s.materials.deletedAt),
          eq(s.materialLinks.lessonId, lessonId),
        ),
      )
      .orderBy(s.materials.id, desc(s.materialVersions.version));
    mats.sort((a, b) => a.m.createdAt.getTime() - b.m.createdAt.getTime());
    const versionIds = mats.map((x) => x.v.id);
    const materialIds = mats.map((x) => x.m.id);

    const older = materialIds.length
      ? await tx.execute<{ material_id: string }>(sql`
          select distinct material_id from (
            select material_id, version_id from slide_annotations where owner_id = ${userId}
            union all
            select material_id, version_id from notebook_entries where owner_id = ${userId}
              and material_id is not null and version_id is not null
            union all
            select material_id, version_id from content_marks where owner_id = ${userId}
              and material_id is not null and version_id is not null
          ) x
          where material_id in ${materialIds} and version_id not in ${versionIds}
        `)
      : { rows: [] };
    const olderSet = new Set(older.rows.map((r) => r.material_id));

    const marks = await tx
      .select()
      .from(s.contentMarks)
      .where(
        and(
          eq(s.contentMarks.ownerId, userId),
          versionIds.length
            ? sql`(${inArray(s.contentMarks.versionId, versionIds)} or ${s.contentMarks.lessonId} = ${lessonId})`
            : eq(s.contentMarks.lessonId, lessonId),
        ),
      )
      .orderBy(asc(s.contentMarks.page), asc(s.contentMarks.createdAt));

    const progress = await tx.query.lessonProgress.findFirst({
      where: and(eq(s.lessonProgress.lessonId, lessonId), eq(s.lessonProgress.ownerId, userId)),
    });

    return {
      lesson: {
        id: l.id,
        title: l.title,
        date: localDayKey(l.startsAt, tz),
        start: l.allDay ? null : hm(l.startsAt, tz),
        end: l.allDay || !l.endsAt ? null : hm(l.endsAt, tz),
        disciplineId: l.disciplineId,
        disciplineName: row.discipline,
        topic: row.topic ?? null,
        teachers: row.teacher ? [row.teacher] : [],
        location: l.location,
        moment: moment(l.startsAt, l.endsAt, l.allDay),
      },
      materials: mats.map((x) => ({
        id: x.m.id,
        title: x.m.title,
        type: x.m.type,
        origin: x.m.origin,
        version: x.v.version,
        versionId: x.v.id,
        file: fileDto(x.f),
        olderAnnotations: olderSet.has(x.m.id),
      })),
      notes: await notesWhere(tx, userId, eq(s.notebookEntries.lessonId, lessonId), tz),
      marks: marks.map(markDto),
      progress: progressDto(progress),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Marcações (AUL-04 a AUL-07, AUL-12)

export async function listAnnotations(userId: string, materialId: string, versionId: string) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownVersion(tx, userId, materialId, versionId);
    const rows = await tx
      .select()
      .from(s.slideAnnotations)
      .where(
        and(eq(s.slideAnnotations.ownerId, userId), eq(s.slideAnnotations.versionId, versionId)),
      )
      .orderBy(asc(s.slideAnnotations.page));
    return { items: rows.map(annotationDto) };
  });
}

export async function saveAnnotation(
  userId: string,
  materialId: string,
  page: number,
  body: z.output<(typeof contract.saveAnnotation)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const { f } = await ownVersion(tx, userId, materialId, body.versionId);
    checkPage(page, f.pageCount);
    const [cur] = await tx
      .select()
      .from(s.slideAnnotations)
      .where(
        and(
          eq(s.slideAnnotations.ownerId, userId),
          eq(s.slideAnnotations.versionId, body.versionId),
          eq(s.slideAnnotations.page, page),
        ),
      )
      .for('update');
    if (!cur) {
      const [created] = await tx
        .insert(s.slideAnnotations)
        .values({
          ownerId: userId,
          materialId,
          versionId: body.versionId,
          page,
          layer: body.layer,
          hidden: body.hidden ?? false,
        })
        .returning();
      return { ...annotationDto(created!), conflict: false };
    }
    const sameLayer = stable(cur.layer) === stable(body.layer);
    const sameHidden = body.hidden === undefined || body.hidden === cur.hidden;
    // Repetição da mesma gravação: nada muda.
    if (sameLayer && sameHidden) return { ...annotationDto(cur), conflict: false };
    const conflict = body.baseRevision !== cur.revision;
    if (!sameLayer) {
      if (conflict) await pushHistory(tx, userId, cur, 'conflito');
      else if (await dueForCopy(tx, cur)) await pushHistory(tx, userId, cur, 'copia');
    }
    const [updated] = await tx
      .update(s.slideAnnotations)
      .set({
        layer: body.layer,
        hidden: body.hidden ?? cur.hidden,
        revision: cur.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(s.slideAnnotations.id, cur.id))
      .returning();
    return { ...annotationDto(updated!), conflict };
  });
}

export async function annotationHistory(
  userId: string,
  materialId: string,
  page: number,
  versionId: string,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownVersion(tx, userId, materialId, versionId);
    const rows = await tx
      .select({ h: s.slideAnnotationHistory })
      .from(s.slideAnnotationHistory)
      .innerJoin(
        s.slideAnnotations,
        eq(s.slideAnnotations.id, s.slideAnnotationHistory.annotationId),
      )
      .where(
        and(
          eq(s.slideAnnotationHistory.ownerId, userId),
          eq(s.slideAnnotations.versionId, versionId),
          eq(s.slideAnnotations.page, page),
        ),
      )
      .orderBy(desc(s.slideAnnotationHistory.savedAt));
    return {
      items: rows.map(({ h }) => ({
        id: h.id,
        revision: h.revision,
        reason: h.reason,
        shapes: Array.isArray(h.layer) ? h.layer.length : 0,
        savedAt: h.savedAt.toISOString(),
      })),
    };
  });
}

export async function restoreAnnotation(userId: string, historyId: string) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const h = await tx.query.slideAnnotationHistory.findFirst({
      where: and(
        eq(s.slideAnnotationHistory.id, historyId),
        eq(s.slideAnnotationHistory.ownerId, userId),
      ),
    });
    if (!h) throw notFound('Versão');
    const [cur] = await tx
      .select()
      .from(s.slideAnnotations)
      .where(eq(s.slideAnnotations.id, h.annotationId))
      .for('update');
    if (!cur) throw notFound('Versão');
    await pushHistory(tx, userId, cur, 'antes de recuperar');
    const [updated] = await tx
      .update(s.slideAnnotations)
      .set({ layer: h.layer, revision: cur.revision + 1, updatedAt: new Date() })
      .where(eq(s.slideAnnotations.id, cur.id))
      .returning();
    return annotationDto(updated!);
  });
}

// ---------------------------------------------------------------------------------------------
// Troca de versão (AUL-25)

/** A versão anterior mais recente que ainda tem marcações, notas ou selos. */
async function olderWithContent(tx: Tx, userId: string, materialId: string, currentId: string) {
  const r = await tx.execute<{ version_id: string }>(sql`
    select x.version_id from (
      select version_id from slide_annotations where owner_id = ${userId} and material_id = ${materialId}
      union
      select version_id from notebook_entries where owner_id = ${userId} and material_id = ${materialId} and version_id is not null
      union
      select version_id from content_marks where owner_id = ${userId} and material_id = ${materialId} and version_id is not null
    ) x
    join material_versions v on v.id = x.version_id
    where x.version_id <> ${currentId}
    order by v.version desc
    limit 1
  `);
  return r.rows[0]?.version_id ?? null;
}

async function pageTexts(tx: Tx, fileId: string) {
  return tx
    .select({ page: s.filePages.page, text: s.filePages.text })
    .from(s.filePages)
    .where(eq(s.filePages.fileId, fileId))
    .orderBy(asc(s.filePages.page));
}

async function contentByPage(tx: Tx, userId: string, versionId: string) {
  const r = await tx.execute<{ page: number; shapes: number; notes: number; marks: number }>(sql`
    select page, sum(shapes)::int as shapes, sum(notes)::int as notes, sum(marks)::int as marks
    from (
      select page, jsonb_array_length(layer) as shapes, 0 as notes, 0 as marks
      from slide_annotations where owner_id = ${userId} and version_id = ${versionId}
      union all
      select page, 0, 1, 0 from notebook_entries
      where owner_id = ${userId} and version_id = ${versionId} and page is not null
      union all
      select page, 0, 0, 1 from content_marks
      where owner_id = ${userId} and version_id = ${versionId} and page is not null
    ) x
    group by page
    order by page
  `);
  return r.rows;
}

export async function reassociationPlan(userId: string, materialId: string) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const cur = await currentVersion(tx, userId, materialId);
    const fromId = await olderWithContent(tx, userId, materialId, cur.v.id);
    const base = {
      toVersionId: cur.v.id,
      toVersion: cur.v.version,
    };
    if (!fromId) return { ...base, fromVersionId: null, fromVersion: null, pages: [] };
    const from = await ownVersion(tx, userId, materialId, fromId);
    const content = await contentByPage(tx, userId, fromId);
    const oldTexts = new Map((await pageTexts(tx, from.f.id)).map((p) => [p.page, p.text]));
    const matches = matchPages(
      content.map((c) => ({ page: c.page, text: oldTexts.get(c.page) ?? '' })),
      await pageTexts(tx, cur.f.id),
    );
    const byPage = new Map(matches.map((m) => [m.from, m]));
    return {
      ...base,
      fromVersionId: fromId,
      fromVersion: from.v.version,
      pages: content.map((c) => ({
        from: c.page,
        to: byPage.get(c.page)?.to ?? null,
        score: byPage.get(c.page)?.score ?? 0,
        shapes: c.shapes,
        notes: c.notes,
        marks: c.marks,
      })),
    };
  });
}

const IMPORTANCE_ORDER = ['nenhuma', 'importante', 'alta'] as const;
const DIFFICULTY_ORDER = ['facil', 'moderado', 'dificil'] as const;

export async function applyReassociation(
  userId: string,
  materialId: string,
  body: z.output<(typeof contract.applyReassociation)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const cur = await currentVersion(tx, userId, materialId);
    if (body.fromVersionId === cur.v.id) throw badRequest('Esta já é a versão atual.');
    await ownVersion(tx, userId, materialId, body.fromVersionId);
    const targets = new Set<number>();
    for (const p of body.pairs) {
      checkPage(p.to, cur.f.pageCount);
      if (targets.has(p.to)) throw badRequest('Cada página nova recebe uma página antiga só.');
      targets.add(p.to);
    }
    let moved = 0;
    for (const p of body.pairs) {
      // Camada: se a página nova já tem marcações, as antigas entram por cima.
      const [old] = await tx
        .select()
        .from(s.slideAnnotations)
        .where(
          and(
            eq(s.slideAnnotations.ownerId, userId),
            eq(s.slideAnnotations.versionId, body.fromVersionId),
            eq(s.slideAnnotations.page, p.from),
          ),
        );
      if (old) {
        const [dest] = await tx
          .select()
          .from(s.slideAnnotations)
          .where(
            and(
              eq(s.slideAnnotations.ownerId, userId),
              eq(s.slideAnnotations.versionId, cur.v.id),
              eq(s.slideAnnotations.page, p.to),
            ),
          )
          .for('update');
        if (dest) {
          await pushHistory(tx, userId, dest, 'antes de reassociar');
          const ids = new Set((dest.layer as Layer).map((x) => x.id));
          const incoming = (old.layer as Layer).map((x) =>
            ids.has(x.id) ? { ...x, id: `${x.id}-v`.slice(0, 40) } : x,
          );
          await tx
            .update(s.slideAnnotations)
            .set({
              layer: [...(dest.layer as Layer), ...incoming],
              revision: dest.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(s.slideAnnotations.id, dest.id));
          await tx.delete(s.slideAnnotations).where(eq(s.slideAnnotations.id, old.id));
        } else {
          await tx
            .update(s.slideAnnotations)
            .set({ versionId: cur.v.id, page: p.to, updatedAt: new Date() })
            .where(eq(s.slideAnnotations.id, old.id));
        }
        moved++;
      }
      const notes = await tx
        .update(s.notebookEntries)
        .set({ versionId: cur.v.id, page: p.to, updatedAt: new Date() })
        .where(
          and(
            eq(s.notebookEntries.ownerId, userId),
            eq(s.notebookEntries.versionId, body.fromVersionId),
            eq(s.notebookEntries.page, p.from),
          ),
        )
        .returning({ id: s.notebookEntries.id });
      moved += notes.length;
      // Selos: os de trecho mudam de página; o do slide inteiro soma ao que já houver.
      const regions = await tx
        .update(s.contentMarks)
        .set({ versionId: cur.v.id, page: p.to, updatedAt: new Date() })
        .where(
          and(
            eq(s.contentMarks.ownerId, userId),
            eq(s.contentMarks.versionId, body.fromVersionId),
            eq(s.contentMarks.page, p.from),
            ne(s.contentMarks.targetType, 'slide'),
          ),
        )
        .returning({ id: s.contentMarks.id });
      moved += regions.length;
      const [slideMark] = await tx
        .select()
        .from(s.contentMarks)
        .where(
          and(
            eq(s.contentMarks.ownerId, userId),
            eq(s.contentMarks.versionId, body.fromVersionId),
            eq(s.contentMarks.page, p.from),
            eq(s.contentMarks.targetType, 'slide'),
          ),
        );
      if (slideMark) {
        const [destMark] = await tx
          .select()
          .from(s.contentMarks)
          .where(
            and(
              eq(s.contentMarks.ownerId, userId),
              eq(s.contentMarks.versionId, cur.v.id),
              eq(s.contentMarks.page, p.to),
              eq(s.contentMarks.targetType, 'slide'),
            ),
          );
        if (destMark) {
          const maxOf = <T extends string>(order: readonly T[], a: T | null, b: T | null) =>
            (a && b ? order[Math.max(order.indexOf(a), order.indexOf(b))] : (a ?? b)) ?? null;
          await tx
            .update(s.contentMarks)
            .set({
              importance: maxOf(IMPORTANCE_ORDER, destMark.importance, slideMark.importance)!,
              difficulty: maxOf(DIFFICULTY_ORDER, destMark.difficulty, slideMark.difficulty),
              doubt:
                destMark.doubt !== null && slideMark.doubt !== null
                  ? [destMark.doubt, slideMark.doubt].filter(Boolean).join('\n')
                  : (destMark.doubt ?? slideMark.doubt),
              updatedAt: new Date(),
            })
            .where(eq(s.contentMarks.id, destMark.id));
          await tx.delete(s.contentMarks).where(eq(s.contentMarks.id, slideMark.id));
        } else {
          await tx
            .update(s.contentMarks)
            .set({ versionId: cur.v.id, page: p.to, updatedAt: new Date() })
            .where(eq(s.contentMarks.id, slideMark.id));
        }
        moved++;
      }
    }
    return { moved };
  });
}

// ---------------------------------------------------------------------------------------------
// Caderno (AUL-08, AUL-10, AUL-11, AUL-23)

export async function listNotes(
  userId: string,
  q: z.output<NonNullable<(typeof contract.listNotes)['query']>>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await tzOf(tx, userId);
    const filters = [];
    if (q.lessonId) {
      await ownLesson(tx, userId, q.lessonId);
      filters.push(eq(s.notebookEntries.lessonId, q.lessonId));
    }
    if (q.disciplineId) filters.push(eq(s.notebookEntries.disciplineId, q.disciplineId));
    if (q.q)
      filters.push(sql`${s.notebookEntries.search} @@ websearch_to_tsquery('cognuss_pt', ${q.q})`);
    return { items: await notesWhere(tx, userId, and(...filters), tz) };
  });
}

async function oneNote(tx: Tx, userId: string, id: string) {
  const [n] = await notesWhere(tx, userId, eq(s.notebookEntries.id, id), await tzOf(tx, userId));
  if (!n) throw notFound('Nota');
  return n;
}

export async function createNote(
  userId: string,
  body: z.output<(typeof contract.createNote)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    let disciplineId = body.disciplineId;
    if (body.lessonId) disciplineId = (await ownLesson(tx, userId, body.lessonId)).disciplineId;
    if (!disciplineId) throw badRequest('Informe a aula ou a disciplina.');
    const disc = await tx.query.enrolledDisciplines.findFirst({
      where: and(
        eq(s.enrolledDisciplines.id, disciplineId),
        eq(s.enrolledDisciplines.ownerId, userId),
      ),
    });
    if (!disc) throw notFound('Disciplina');
    if (body.materialId || body.versionId) {
      if (!body.materialId || !body.versionId) throw badRequest('Informe o material e a versão.');
      const { f } = await ownVersion(tx, userId, body.materialId, body.versionId);
      if (body.page) checkPage(body.page, f.pageCount);
    }
    const [n] = await tx
      .insert(s.notebookEntries)
      .values({
        ownerId: userId,
        disciplineId,
        lessonId: body.lessonId,
        materialId: body.materialId,
        versionId: body.versionId,
        page: body.page,
        region: body.region,
        content: { text: body.text },
        plainText: body.text,
      })
      .returning();
    return oneNote(tx, userId, n!.id);
  });
}

export async function updateNote(
  userId: string,
  id: string,
  body: z.output<(typeof contract.updateNote)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const [cur] = await tx
      .select()
      .from(s.notebookEntries)
      .where(and(eq(s.notebookEntries.id, id), eq(s.notebookEntries.ownerId, userId)))
      .for('update');
    if (!cur) throw notFound('Nota');
    if (cur.content.text === body.text)
      return { ...(await oneNote(tx, userId, id)), conflict: false };
    const conflict = body.baseRevision !== cur.revision;
    const last = await tx.query.notebookEntryHistory.findFirst({
      where: eq(s.notebookEntryHistory.entryId, id),
      orderBy: desc(s.notebookEntryHistory.savedAt),
    });
    const since = last?.savedAt ?? cur.createdAt;
    if (conflict || Date.now() - since.getTime() >= COPY_EVERY_MS) {
      await tx.insert(s.notebookEntryHistory).values({
        ownerId: userId,
        entryId: id,
        revision: cur.revision,
        content: cur.content,
      });
      await tx.execute(sql`
        delete from notebook_entry_history
        where entry_id = ${id} and owner_id = ${userId} and id not in (
          select id from notebook_entry_history where entry_id = ${id}
          order by saved_at desc limit ${HISTORY_KEEP})
      `);
    }
    await tx
      .update(s.notebookEntries)
      .set({
        content: { text: body.text },
        plainText: body.text,
        revision: cur.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(s.notebookEntries.id, id));
    return { ...(await oneNote(tx, userId, id)), conflict };
  });
}

export async function deleteNote(userId: string, id: string) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const gone = await tx
      .delete(s.notebookEntries)
      .where(and(eq(s.notebookEntries.id, id), eq(s.notebookEntries.ownerId, userId)))
      .returning({ id: s.notebookEntries.id });
    if (!gone.length) throw notFound('Nota');
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------------------------
// Selos e dúvidas (AUL-13 a AUL-16)

export async function saveMark(userId: string, body: z.output<(typeof contract.saveMark)['body']>) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    if (body.lessonId) await ownLesson(tx, userId, body.lessonId);
    if (body.targetType === 'tema') {
      const t = await tx.query.disciplineTopics.findFirst({
        where: and(
          eq(s.disciplineTopics.id, body.topicId!),
          eq(s.disciplineTopics.ownerId, userId),
        ),
      });
      if (!t) throw notFound('Tema');
    } else {
      const { f } = await ownVersion(tx, userId, body.materialId!, body.versionId!);
      checkPage(body.page!, f.pageCount);
    }
    const values = {
      ...(body.importance !== undefined && { importance: body.importance }),
      ...(body.difficulty !== undefined && { difficulty: body.difficulty }),
      ...(body.doubt !== undefined && { doubt: body.doubt, doubtResolvedAt: null }),
    };
    const row = {
      ownerId: userId,
      targetType: body.targetType,
      lessonId: body.lessonId,
      materialId: body.materialId,
      versionId: body.versionId,
      page: body.page,
      region: body.region,
      topicId: body.topicId,
      ...values,
    };
    // Slide inteiro: um selo só. Dois toques seguidos (ou dois aparelhos) não duplicam.
    const [m] =
      body.targetType === 'slide'
        ? await tx
            .insert(s.contentMarks)
            .values(row)
            .onConflictDoUpdate({
              target: [s.contentMarks.versionId, s.contentMarks.page],
              targetWhere: sql`target_type = 'slide'`,
              set: {
                ...values,
                lessonId: sql`coalesce(${s.contentMarks.lessonId}, excluded.lesson_id)`,
                updatedAt: new Date(),
              },
            })
            .returning()
        : await tx.insert(s.contentMarks).values(row).returning();
    return markDto(m!);
  });
}

export async function updateMark(
  userId: string,
  id: string,
  body: z.output<(typeof contract.updateMark)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const [m] = await tx
      .update(s.contentMarks)
      .set({
        ...(body.importance !== undefined && { importance: body.importance }),
        ...(body.difficulty !== undefined && { difficulty: body.difficulty }),
        ...(body.doubt !== undefined && { doubt: body.doubt, doubtResolvedAt: null }),
        ...(body.doubtResolved !== undefined && {
          doubtResolvedAt: body.doubtResolved ? new Date() : null,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(s.contentMarks.id, id), eq(s.contentMarks.ownerId, userId)))
      .returning();
    if (!m) throw notFound('Selo');
    return markDto(m);
  });
}

export async function deleteMark(userId: string, id: string) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    const gone = await tx
      .delete(s.contentMarks)
      .where(and(eq(s.contentMarks.id, id), eq(s.contentMarks.ownerId, userId)))
      .returning({ id: s.contentMarks.id });
    if (!gone.length) throw notFound('Selo');
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------------------------
// Presença, onde parou e concluir aula (AUL-18, AUL-26, AUL-30)

export async function saveProgress(
  userId: string,
  lessonId: string,
  body: z.output<(typeof contract.saveProgress)['body']>,
) {
  await assertLessonStudyEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownLesson(tx, userId, lessonId);
    if (body.lastMaterialId) {
      const m = await tx.query.materials.findFirst({
        where: and(eq(s.materials.id, body.lastMaterialId), eq(s.materials.ownerId, userId)),
      });
      if (!m) throw notFound('Material');
    }
    const cur = await tx.query.lessonProgress.findFirst({
      where: and(eq(s.lessonProgress.lessonId, lessonId), eq(s.lessonProgress.ownerId, userId)),
    });
    const set = {
      ...(body.attended !== undefined && { attended: body.attended }),
      ...(body.overallDifficulty !== undefined && { overallDifficulty: body.overallDifficulty }),
      ...(body.understoodGoals !== undefined && { understoodGoals: body.understoodGoals }),
      ...(body.hasDoubts !== undefined && { hasDoubts: body.hasDoubts }),
      ...(body.wantsReview !== undefined && { wantsReview: body.wantsReview }),
      ...(body.concluded !== undefined && {
        concludedAt: body.concluded ? (cur?.concludedAt ?? new Date()) : null,
      }),
      ...(body.lastMaterialId !== undefined && { lastMaterialId: body.lastMaterialId }),
      ...(body.lastPage !== undefined && { lastPage: body.lastPage }),
    };
    const [p] = cur
      ? await tx
          .update(s.lessonProgress)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(s.lessonProgress.id, cur.id))
          .returning()
      : await tx
          .insert(s.lessonProgress)
          .values({ ownerId: userId, lessonId, ...set })
          .returning();
    // "Quero uma revisão de 30 minutos" (AUL-22) vira pedido ao Equilíbrio (EQU-18), que entra
    // na próxima proposta; nada vai para a agenda sem confirmação.
    if (p?.concludedAt && p.wantsReview && (await flags()).equilibrio)
      await requestTask(tx, userId, 'aula', lessonId);
    return progressDto(p);
  });
}

/** Para a página do material: as aulas em que ele está, para abrir o Acompanhar Aula. */
export async function lessonsOfMaterial(userId: string, materialId: string) {
  return withUser(db(), userId, async (tx) =>
    tx
      .select({ id: s.lessons.id, title: s.lessons.title, startsAt: s.lessons.startsAt })
      .from(s.materialLinks)
      .innerJoin(s.lessons, eq(s.lessons.id, s.materialLinks.lessonId))
      .where(and(eq(s.materialLinks.ownerId, userId), eq(s.materialLinks.materialId, materialId)))
      .orderBy(asc(s.lessons.startsAt)),
  );
}
