import 'server-only';
import { localDayKey, textSimilarity } from '@gutta/core';
import type { materials as contract } from '@gutta/contracts';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
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
import { markCreationsStale } from '@/features/ajuda/service';

// Material de estudo (SPEC v2, MAT-01 a MAT-07, MAT-14 a MAT-17, MAT-19, MAT-21), conteúdo de
// aula (MAT-02, MAT-03) e busca por palavra (MAT-09; ADR 0014). Tudo como o dono (withUser).

type Body = z.output<typeof contract.materialBody>;
type MaterialRow = typeof s.materials.$inferSelect;
type Dto = contract.MaterialDto;

export async function assertMaterialsEnabled() {
  const on = await flags();
  if (!on.materiais) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function tzOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

async function currentTermId(tx: Tx, userId: string) {
  const t = await tx.query.studentTerms.findFirst({
    where: and(eq(s.studentTerms.ownerId, userId), eq(s.studentTerms.isCurrent, true)),
  });
  return t?.id ?? null;
}

/** Monta os DTOs de vários materiais de uma vez (versões, arquivos e vínculos). */
async function toDtos(tx: Tx, rows: MaterialRow[], tz: string): Promise<Dto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const versions = await tx
    .select({ v: s.materialVersions, f: s.files })
    .from(s.materialVersions)
    .innerJoin(s.files, eq(s.files.id, s.materialVersions.fileId))
    .where(inArray(s.materialVersions.materialId, ids))
    .orderBy(desc(s.materialVersions.version));
  const links = await tx
    .select({
      l: s.materialLinks,
      discipline: s.enrolledDisciplines.name,
      lessonTitle: s.lessons.title,
      lessonAt: s.lessons.startsAt,
      topic: s.disciplineTopics.name,
      teacher: s.disciplineTeachers.name,
    })
    .from(s.materialLinks)
    .leftJoin(s.enrolledDisciplines, eq(s.enrolledDisciplines.id, s.materialLinks.disciplineId))
    .leftJoin(s.lessons, eq(s.lessons.id, s.materialLinks.lessonId))
    .leftJoin(s.disciplineTopics, eq(s.disciplineTopics.id, s.materialLinks.topicId))
    .leftJoin(s.disciplineTeachers, eq(s.disciplineTeachers.id, s.materialLinks.teacherId))
    .where(inArray(s.materialLinks.materialId, ids))
    .orderBy(asc(s.materialLinks.createdAt));
  const out: Dto[] = [];
  for (const m of rows) {
    const vs = versions.filter((x) => x.v.materialId === m.id);
    if (!vs.length) continue;
    out.push({
      id: m.id,
      title: m.title,
      type: m.type,
      origin: m.origin,
      favorite: m.favorite,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      termId: m.termId,
      version: vs[0]!.v.version,
      file: fileDto(vs[0]!.f),
      versions: vs.map((x) => ({
        version: x.v.version,
        file: fileDto(x.f),
        createdAt: x.v.createdAt.toISOString(),
      })),
      links: links
        .filter((x) => x.l.materialId === m.id)
        .map((x) => ({
          id: x.l.id,
          disciplineId: x.l.disciplineId,
          disciplineName: x.discipline ?? null,
          lessonId: x.l.lessonId,
          lessonTitle: x.lessonTitle ?? null,
          lessonDate: x.lessonAt ? localDayKey(x.lessonAt, tz) : null,
          topic: x.topic ?? null,
          teacher: x.teacher ?? null,
        })),
    });
  }
  return out;
}

async function findOwn(tx: Tx, userId: string, id: string) {
  const row = await tx.query.materials.findFirst({
    where: and(eq(s.materials.id, id), eq(s.materials.ownerId, userId)),
  });
  if (!row) throw notFound('Material');
  return row;
}

async function oneDto(tx: Tx, userId: string, id: string) {
  const [dto] = await toDtos(tx, [await findOwn(tx, userId, id)], await tzOf(tx, userId));
  return dto!;
}

async function ownFile(tx: Tx, userId: string, fileId: string) {
  const f = await tx.query.files.findFirst({
    where: and(eq(s.files.id, fileId), eq(s.files.ownerId, userId)),
  });
  if (!f) throw notFound('Arquivo');
  if (f.status === 'quarantined') throw badRequest('Este arquivo foi bloqueado pelo antivírus.');
  return f;
}

/** Tema e docente em listas com o que já existe, com opção de digitar (MAT-05). */
async function byName(
  tx: Tx,
  table: typeof s.disciplineTopics | typeof s.disciplineTeachers,
  userId: string,
  disciplineId: string,
  name: string | null | undefined,
) {
  if (!name) return null;
  const rows = await tx
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.disciplineId, disciplineId));
  const found = rows.find((r) => textSimilarity(r.name, name) >= 0.85);
  if (found) return found.id;
  const [row] = await tx
    .insert(table)
    .values({ ownerId: userId, disciplineId, name })
    .returning({ id: table.id });
  return row!.id;
}

async function addLink(
  tx: Tx,
  userId: string,
  materialId: string,
  link: {
    disciplineId: string;
    lessonId?: string | null;
    topic?: string | null;
    teacher?: string | null;
  },
) {
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(
      eq(s.enrolledDisciplines.id, link.disciplineId),
      eq(s.enrolledDisciplines.ownerId, userId),
    ),
  });
  if (!d) throw notFound('Disciplina');
  if (link.lessonId) {
    const l = await tx.query.lessons.findFirst({
      where: and(eq(s.lessons.id, link.lessonId), eq(s.lessons.disciplineId, d.id)),
    });
    if (!l) throw notFound('Aula');
  }
  await tx.insert(s.materialLinks).values({
    ownerId: userId,
    materialId,
    disciplineId: d.id,
    lessonId: link.lessonId ?? null,
    topicId: await byName(tx, s.disciplineTopics, userId, d.id, link.topic),
    teacherId: await byName(tx, s.disciplineTeachers, userId, d.id, link.teacher),
  });
}

export async function createMaterial(userId: string, body: Body) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownFile(tx, userId, body.fileId);
    const [m] = await tx
      .insert(s.materials)
      .values({
        ownerId: userId,
        title: body.title,
        type: body.type,
        origin: body.origin,
        termId: body.termId ?? (await currentTermId(tx, userId)),
      })
      .returning();
    await tx
      .insert(s.materialVersions)
      .values({ ownerId: userId, materialId: m!.id, fileId: body.fileId, version: 1 });
    await addLink(tx, userId, m!.id, body);
    // Material novo na disciplina: criações dela ficam desatualizadas (AJU-11).
    await markCreationsStale(tx, userId, [body.disciplineId]);
    return { material: await oneDto(tx, userId, m!.id) };
  });
}

export async function listMaterials(
  userId: string,
  q: { tab: z.output<typeof contract.Tab>; disciplineId?: string; type?: string },
) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    const term = await currentTermId(tx, userId);
    const byDiscipline = q.disciplineId
      ? sql`exists (select 1 from material_links l where l.material_id = ${s.materials.id} and l.discipline_id = ${q.disciplineId})`
      : undefined;
    const rows = await tx
      .select()
      .from(s.materials)
      .where(
        and(
          eq(s.materials.ownerId, userId),
          q.tab === 'lixeira' ? isNotNull(s.materials.deletedAt) : isNull(s.materials.deletedAt),
          q.tab === 'favoritos' ? eq(s.materials.favorite, true) : undefined,
          q.tab === 'atual' && term ? eq(s.materials.termId, term) : undefined,
          q.tab === 'anteriores' ? sql`${s.materials.termId} is distinct from ${term}` : undefined,
          q.type ? eq(s.materials.type, q.type as 'estudo') : undefined,
          byDiscipline,
        ),
      )
      .orderBy(desc(s.materials.createdAt))
      .limit(200);
    return { items: await toDtos(tx, rows, await tzOf(tx, userId)) };
  });
}

export async function updateMaterial(
  userId: string,
  id: string,
  patch: {
    title?: string;
    type?: 'estudo' | 'atividade' | 'prova';
    origin?: Dto['origin'];
    favorite?: boolean;
  },
) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    if (Object.keys(patch).length)
      await tx.update(s.materials).set(patch).where(eq(s.materials.id, id));
    return { material: await oneDto(tx, userId, id) };
  });
}

export async function addVersion(userId: string, id: string, fileId: string) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    await ownFile(tx, userId, fileId);
    const [last] = await tx
      .select({ v: sql<number>`max(${s.materialVersions.version})::int` })
      .from(s.materialVersions)
      .where(eq(s.materialVersions.materialId, id));
    await tx
      .insert(s.materialVersions)
      .values({ ownerId: userId, materialId: id, fileId, version: (last?.v ?? 0) + 1 });
    const links = await tx
      .select({ d: s.materialLinks.disciplineId })
      .from(s.materialLinks)
      .where(eq(s.materialLinks.materialId, id));
    await markCreationsStale(
      tx,
      userId,
      links.map((l) => l.d).filter((d): d is string => Boolean(d)),
    );
    return { material: await oneDto(tx, userId, id) };
  });
}

export async function linkMaterial(
  userId: string,
  id: string,
  link: {
    disciplineId: string;
    lessonId?: string | null;
    topic?: string | null;
    teacher?: string | null;
  },
) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    await addLink(tx, userId, id, link);
    await markCreationsStale(tx, userId, [link.disciplineId]);
    return { material: await oneDto(tx, userId, id) };
  });
}

export async function trashMaterial(userId: string, id: string) {
  await assertMaterialsEnabled();
  await withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    await tx
      .update(s.materials)
      .set({ deletedAt: sql`now()` })
      .where(eq(s.materials.id, id));
  });
  return { ok: true as const };
}

export async function restoreMaterial(userId: string, id: string) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    await tx.update(s.materials).set({ deletedAt: null }).where(eq(s.materials.id, id));
    return { material: await oneDto(tx, userId, id) };
  });
}

/** Conteúdo de aula (MAT-02, MAT-03): cada aula do cronograma com os materiais dela. */
export async function lessonContent(userId: string, disciplineId: string) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    const d = await tx.query.enrolledDisciplines.findFirst({
      where: and(
        eq(s.enrolledDisciplines.id, disciplineId),
        eq(s.enrolledDisciplines.ownerId, userId),
      ),
    });
    if (!d) throw notFound('Disciplina');
    const tz = await tzOf(tx, userId);
    const lessons = await tx
      .select({ l: s.lessons, topic: s.disciplineTopics.name, teacher: s.disciplineTeachers.name })
      .from(s.lessons)
      .leftJoin(s.disciplineTopics, eq(s.disciplineTopics.id, s.lessons.topicId))
      .leftJoin(s.disciplineTeachers, eq(s.disciplineTeachers.id, s.lessons.teacherId))
      .where(
        and(
          eq(s.lessons.disciplineId, disciplineId),
          isNull(s.lessons.cancelledAt),
          inArray(s.lessons.kind, ['aula', 'pratica']),
        ),
      )
      .orderBy(asc(s.lessons.startsAt));
    const rows = await tx
      .select()
      .from(s.materials)
      .where(
        and(
          eq(s.materials.ownerId, userId),
          isNull(s.materials.deletedAt),
          sql`exists (select 1 from material_links l where l.material_id = ${s.materials.id} and l.discipline_id = ${disciplineId})`,
        ),
      )
      .orderBy(asc(s.materials.createdAt));
    const dtos = await toDtos(tx, rows, tz);
    const hm = (x: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(x);
    return {
      disciplineName: d.name,
      lessons: lessons.map((x) => ({
        lessonId: x.l.id,
        date: localDayKey(x.l.startsAt, tz),
        time: x.l.allDay ? null : hm(x.l.startsAt),
        title: x.l.title,
        topic: x.topic ?? null,
        teacher: x.teacher ?? null,
        materials: dtos
          .filter((m) => m.links.some((k) => k.lessonId === x.l.id))
          .map((m) => ({ id: m.id, title: m.title, type: m.type, origin: m.origin, file: m.file })),
      })),
      loose: dtos.filter(
        (m) => !m.links.some((k) => k.disciplineId === disciplineId && k.lessonId),
      ),
    };
  });
}

/**
 * Busca por palavra (MAT-09; ADR 0014): título do material, texto das páginas da versão atual
 * e lembretes. Português sem acento; o trecho vem marcado com « ». O filtro do dono vai
 * explícito, além do RLS.
 */
export async function search(
  userId: string,
  q: { q: string; disciplineId?: string; type?: string },
) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => {
    const query = sql`websearch_to_tsquery('cognuss_pt', ${q.q})`;
    const disc = q.disciplineId
      ? sql`and exists (select 1 from material_links l where l.material_id = m.id and l.discipline_id = ${q.disciplineId})`
      : sql``;
    const type = q.type ? sql`and m.type = ${q.type}` : sql``;
    const hits = await tx.execute<{
      kind: 'material' | 'pagina' | 'anotacao' | 'lembrete';
      material_id: string | null;
      title: string;
      snippet: string | null;
      page: number | null;
      discipline: string | null;
      type: 'estudo' | 'atividade' | 'prova' | null;
      rank: number;
      lesson_id: string | null;
      discipline_id: string | null;
    }>(sql`
      with current_version as (
        select distinct on (v.material_id) v.material_id, v.file_id
        from material_versions v
        where v.owner_id = ${userId}
        order by v.material_id, v.version desc
      ),
      first_discipline as (
        select distinct on (l.material_id) l.material_id, d.name
        from material_links l join enrolled_disciplines d on d.id = l.discipline_id
        where l.owner_id = ${userId}
        order by l.material_id, l.created_at
      )
      select 'material' as kind, m.id as material_id, m.title, null as snippet, null::int as page,
             fd.name as discipline, m.type::text as type, ts_rank(m.search, ${query}) * 2 as rank,
             null::uuid as lesson_id, null::uuid as discipline_id
      from materials m left join first_discipline fd on fd.material_id = m.id
      where m.owner_id = ${userId} and m.deleted_at is null and m.search @@ ${query} ${disc} ${type}
      union all
      select 'pagina', m.id, m.title,
             ts_headline('cognuss_pt', p.text, ${query},
               'StartSel=«, StopSel=», MaxWords=30, MinWords=12, MaxFragments=1'),
             p.page, fd.name, m.type::text, ts_rank(p.search, ${query}), null, null
      from file_pages p
      join current_version cv on cv.file_id = p.file_id
      join materials m on m.id = cv.material_id
      left join first_discipline fd on fd.material_id = m.id
      where p.owner_id = ${userId} and m.deleted_at is null and p.search @@ ${query} ${disc} ${type}
      union all
      select 'anotacao', n.material_id,
             coalesce(ls.title, d.name),
             ts_headline('cognuss_pt', n.plain_text, ${query},
               'StartSel=«, StopSel=», MaxWords=30, MinWords=12, MaxFragments=1'),
             n.page, d.name, null, ts_rank(n.search, ${query}),
             n.lesson_id, n.discipline_id
      from notebook_entries n
      join enrolled_disciplines d on d.id = n.discipline_id
      left join lessons ls on ls.id = n.lesson_id
      where n.owner_id = ${userId} and n.search @@ ${query}
        ${q.disciplineId ? sql`and n.discipline_id = ${q.disciplineId}` : sql``}
        ${q.type ? sql`and false` : sql``}
      union all
      select 'lembrete', null, r.title, r.description, null, null, null,
             ts_rank(to_tsvector('cognuss_pt', r.title || ' ' || coalesce(r.description, '')), ${query}),
             null, null
      from reminders r
      where r.owner_id = ${userId}
        and to_tsvector('cognuss_pt', r.title || ' ' || coalesce(r.description, '')) @@ ${query}
        ${q.disciplineId || q.type ? sql`and false` : sql``}
      order by rank desc
      limit 50
    `);
    return {
      items: hits.rows.map((h) => ({
        kind: h.kind,
        materialId: h.material_id,
        title: h.title,
        snippet: h.snippet,
        page: h.page,
        disciplineName: h.discipline,
        type: h.type,
        link:
          h.kind === 'lembrete'
            ? '/app/lembretes'
            : h.kind === 'anotacao'
              ? h.lesson_id
                ? `/app/aulas/${h.lesson_id}${h.material_id && h.page ? `?material=${h.material_id}&pagina=${h.page}` : ''}`
                : `/app/minhas-disciplinas/${h.discipline_id}/caderno`
              : `/app/materiais/${h.material_id}${h.page ? `?pagina=${h.page}` : ''}`,
      })),
    };
  });
}

/** Disciplinas do semestre com docentes e temas já cadastrados (listas do MAT-05). */
export async function disciplinesForMaterials(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const term = await currentTermId(tx, userId);
    if (!term) return [];
    const discs = await tx
      .select({ id: s.enrolledDisciplines.id, name: s.enrolledDisciplines.name })
      .from(s.enrolledDisciplines)
      .where(
        and(
          eq(s.enrolledDisciplines.ownerId, userId),
          eq(s.enrolledDisciplines.termId, term),
          isNull(s.enrolledDisciplines.archivedAt),
        ),
      )
      .orderBy(asc(s.enrolledDisciplines.createdAt));
    const ids = discs.map((d) => d.id);
    const teachers = ids.length
      ? await tx
          .select()
          .from(s.disciplineTeachers)
          .where(inArray(s.disciplineTeachers.disciplineId, ids))
      : [];
    const topics = ids.length
      ? await tx
          .select()
          .from(s.disciplineTopics)
          .where(inArray(s.disciplineTopics.disciplineId, ids))
      : [];
    return discs.map((d) => ({
      id: d.id,
      name: d.name,
      teachers: teachers.filter((t) => t.disciplineId === d.id).map((t) => t.name),
      topics: topics.filter((t) => t.disciplineId === d.id).map((t) => t.name),
    }));
  });
}

/** Um material, para a página dele. */
export async function getMaterial(userId: string, id: string) {
  await assertMaterialsEnabled();
  return withUser(db(), userId, async (tx) => ({ material: await oneDto(tx, userId, id) }));
}
