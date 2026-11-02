import 'server-only';
import { and, asc, eq, inArray, isNull, schema as s, withUser } from '@gutta/db';
import { db } from '@/lib/db';

// Catálogo do curso do aluno: disciplinas ativas dele primeiro. Só conteúdo publicado (RLS).
export async function listDisciplines(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
    });
    if (!profile) return { mine: [], others: [] };
    const all = await tx
      .select()
      .from(s.disciplines)
      .where(and(eq(s.disciplines.courseId, profile.courseId), eq(s.disciplines.active, true)))
      .orderBy(asc(s.disciplines.periodHint), asc(s.disciplines.name));
    const active = await tx
      .select({ id: s.studentDisciplines.disciplineId })
      .from(s.studentDisciplines)
      .where(
        and(eq(s.studentDisciplines.studentId, userId), isNull(s.studentDisciplines.activeUntil)),
      );
    const mods = all.length
      ? await tx
          .select({ disciplineId: s.modules.disciplineId, id: s.modules.id })
          .from(s.modules)
          .where(
            and(
              inArray(
                s.modules.disciplineId,
                all.map((d) => d.id),
              ),
              eq(s.modules.status, 'published'),
            ),
          )
      : [];
    const ids = new Set(active.map((a) => a.id));
    const withCount = all.map((d) => ({
      ...d,
      moduleCount: mods.filter((m) => m.disciplineId === d.id).length,
    }));
    return {
      mine: withCount.filter((d) => ids.has(d.id)),
      others: withCount.filter((d) => !ids.has(d.id)),
    };
  });
}

export async function getDiscipline(userId: string, slug: string) {
  return withUser(db(), userId, async (tx) => {
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
    });
    if (!profile) return null;
    const discipline = await tx.query.disciplines.findFirst({
      where: and(eq(s.disciplines.courseId, profile.courseId), eq(s.disciplines.slug, slug)),
    });
    if (!discipline) return null;
    const [modules, topics] = await Promise.all([
      tx
        .select()
        .from(s.modules)
        .where(and(eq(s.modules.disciplineId, discipline.id), eq(s.modules.status, 'published')))
        .orderBy(asc(s.modules.orderIndex), asc(s.modules.title)),
      tx
        .select()
        .from(s.topics)
        .where(eq(s.topics.disciplineId, discipline.id))
        .orderBy(asc(s.topics.orderIndex)),
    ]);
    return { discipline, modules, topics };
  });
}

export async function getModule(userId: string, disciplineSlug: string, moduleSlug: string) {
  const d = await getDiscipline(userId, disciplineSlug);
  if (!d) return null;
  const mod = d.modules.find((m) => m.slug === moduleSlug);
  if (!mod) return null;
  const topicIds = d.topics
    .filter((t) => t.id === mod.topicId || t.parentId === mod.topicId)
    .map((t) => t.id);
  return { ...d, module: mod, topicIds };
}

/** A aula só entra em iframe se a origem estiver na lista permitida (CSP frame-src). */
export function embeddableLesson(url: string | null): { url: string; embed: boolean } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const allowed = (process.env.LESSON_ORIGINS ?? '').split(/[\s,]+/).filter(Boolean);
    return { url: u.toString(), embed: allowed.includes(u.origin) };
  } catch {
    return null;
  }
}
