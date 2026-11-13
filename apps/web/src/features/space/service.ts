import 'server-only';
import { addDays, localDayKey, zonedTimeToUtc } from '@gutta/core';
import type { agenda, disciplines as discContract, routine } from '@gutta/contracts';
import { and, count, eq, isNull, schema as s, sql, withUser } from '@gutta/db';
import { db } from '@/lib/db';
import { currentDisciplines } from '@/features/academics/service';
import { agendaOccurrences, toItemDto, userTimezone } from '@/features/agenda/service';
import { loadRoutine } from '@/features/routine/service';
import { MAIN_GOALS } from '@/features/signup/steps';

// Meu Espaço, versão inicial (SPEC v2, ESP-01 a ESP-06, ESP-09 e ESP-13). Tudo vem de dados
// reais do aluno: perfil, disciplinas com cronograma e rotina. Sem dado, cada cartão diz o
// que falta; nunca mostra número inventado.

export type SpaceDiscipline = discContract.DisciplineDto & {
  lessons: { total: number; past: number };
};

export type Space = {
  greetingName: string;
  profile: {
    course: string | null;
    semester: number | null;
    institution: string | null;
    campus: string | null;
    classGroup: string | null;
    mainGoal: string | null;
    mainGoalLabel: string | null;
  };
  today: string;
  todayItems: agenda.AgendaItemDto[];
  disciplines: SpaceDiscipline[];
  routine: {
    hasBlocks: boolean;
    summary: routine.RoutineDto['summary'];
    goal: routine.RoutineDto['goal'];
    /** Média diária do sono registrado na rotina; null sem sono registrado (ESP-05, L6). */
    sleepDailyMinutes: number | null;
  };
  upcoming: agenda.AgendaItemDto[];
};

export async function loadSpace(userId: string): Promise<Space> {
  const disciplines = await currentDisciplines(userId);
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const today = localDayKey(new Date(), tz);
    const account = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const [p] = await tx
      .select({
        course: s.courses.name,
        courseOther: s.studentProfiles.courseOther,
        semester: s.studentProfiles.semester,
        institution: s.institutions.name,
        institutionOther: s.studentProfiles.institutionOther,
        campus: s.studentProfiles.campus,
        classGroup: s.studentProfiles.classGroup,
        mainGoal: s.studentProfiles.mainGoal,
      })
      .from(s.studentProfiles)
      .innerJoin(s.courses, eq(s.courses.id, s.studentProfiles.courseId))
      .leftJoin(s.institutions, eq(s.institutions.id, s.studentProfiles.institutionId))
      .where(eq(s.studentProfiles.userId, userId));

    // Aulas do cronograma por disciplina: quantas há e quantas já aconteceram (base do
    // progresso da seção 6.4, que depende do Acompanhar Aula para virar percentual).
    const now = new Date();
    const stats = await tx
      .select({
        disciplineId: s.lessons.disciplineId,
        total: count(),
        past: sql<number>`count(*) filter (where ${s.lessons.startsAt} < ${now})::int`,
      })
      .from(s.lessons)
      .where(
        and(
          eq(s.lessons.ownerId, userId),
          eq(s.lessons.kind, 'aula'),
          isNull(s.lessons.cancelledAt),
        ),
      )
      .groupBy(s.lessons.disciplineId);

    const dayFrom = zonedTimeToUtc(today, tz);
    const dayTo = zonedTimeToUtc(addDays(today, 1), tz);
    const todayOcc = await agendaOccurrences(tx, userId, tz, dayFrom, dayTo);

    // Próximos compromissos (ESP-09): provas, entregas, atividades, práticas e eventos, 14 dias.
    const ahead = await agendaOccurrences(
      tx,
      userId,
      tz,
      now,
      zonedTimeToUtc(addDays(today, 15), tz),
    );
    const upcoming = ahead
      .filter(
        (o) =>
          o.source === 'assessment' ||
          (o.source === 'lesson' && (o.kind === 'pratica' || o.kind === 'outro')),
      )
      .slice(0, 6);

    const r = await loadRoutine(tx, userId, today);
    const hasBlocks = r.blocks.length > 0;
    // Média do sono que o aluno registrou na rotina: soma das noites da semana dividida por 7.
    const sleep = r.blocks.filter((b) => b.kind === 'pessoal' && b.category === 'sono');
    const sleepDailyMinutes = sleep.length
      ? Math.round(sleep.reduce((n, b) => n + b.durationMinutes * b.weekdays.length, 0) / 7)
      : null;

    const name = account?.displayName?.trim() ?? '';
    return {
      greetingName: name.split(/\s+/)[0] ?? '',
      profile: {
        course: p ? (p.courseOther ?? p.course) : null,
        semester: p?.semester ?? null,
        institution: p ? (p.institution ?? p.institutionOther) : null,
        campus: p?.campus ?? null,
        classGroup: p?.classGroup ?? null,
        mainGoal: p?.mainGoal ?? null,
        mainGoalLabel: MAIN_GOALS.find((g) => g.value === p?.mainGoal)?.label ?? null,
      },
      today,
      todayItems: todayOcc.map((o) => toItemDto(o, tz)),
      disciplines: disciplines.map((d) => {
        const st = stats.find((x) => x.disciplineId === d.id);
        return { ...d, lessons: { total: st?.total ?? 0, past: st?.past ?? 0 } };
      }),
      routine: { hasBlocks, summary: r.summary, goal: r.goal, sleepDailyMinutes },
      upcoming: upcoming.map((o) => toItemDto(o, tz)),
    };
  });
}

/** "Alterar objetivo" (CAD-03, ESP-01). */
export async function changeMainGoal(userId: string, goal: string) {
  const valid = MAIN_GOALS.find((g) => g.value === goal);
  if (!valid) return false;
  await withUser(db(), userId, (tx) =>
    tx
      .update(s.studentProfiles)
      .set({ mainGoal: valid.value })
      .where(eq(s.studentProfiles.userId, userId)),
  );
  return true;
}
