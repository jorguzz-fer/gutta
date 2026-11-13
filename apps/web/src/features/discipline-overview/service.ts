import 'server-only';
import { addDays, localDayKey, zonedTimeToUtc } from '@gutta/core';
import { and, asc, count, eq, isNull, schema as s, withUser } from '@gutta/db';
import { notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { currentDisciplines } from '@/features/academics/service';
import { flags } from '@/features/flags/service';

// Visão geral da disciplina (SPEC v2, DSC-01 a DSC-06; tela T11). Junta o que já existe em
// cada módulo, sem copiar nada: cronograma, lembretes, faltas e notas.

export type OverviewEvent = {
  id: string;
  date: string;
  time: string | null;
  type: 'aula' | 'pratica' | 'outro' | 'prova' | 'atividade' | 'entrega';
  title: string;
  description: string | null;
  teacher: string | null;
};

export async function disciplineOverview(userId: string, disciplineId: string) {
  const on = await flags();
  const discipline = (await currentDisciplines(userId)).find((d) => d.id === disciplineId);
  if (!discipline) throw notFound('Disciplina');
  return withUser(db(), userId, async (tx) => {
    const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const tz = profile?.timezone ?? 'America/Sao_Paulo';
    const today = localDayKey(new Date(), tz);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(d);

    const allLessons = await tx
      .select({
        l: s.lessons,
        topic: s.disciplineTopics.name,
        teacher: s.disciplineTeachers.name,
      })
      .from(s.lessons)
      .leftJoin(s.disciplineTopics, eq(s.disciplineTopics.id, s.lessons.topicId))
      .leftJoin(s.disciplineTeachers, eq(s.disciplineTeachers.id, s.lessons.teacherId))
      .where(and(eq(s.lessons.disciplineId, disciplineId), isNull(s.lessons.cancelledAt)))
      .orderBy(asc(s.lessons.startsAt));
    const assessments = await tx
      .select()
      .from(s.assessments)
      .where(eq(s.assessments.disciplineId, disciplineId))
      .orderBy(asc(s.assessments.dueAt));

    const now = new Date();
    const next = allLessons.find((x) => x.l.kind !== 'outro' && x.l.startsAt >= now);
    const period =
      allLessons.length > 0
        ? {
            from: localDayKey(allLessons[0]!.l.startsAt, tz),
            to: localDayKey(allLessons.at(-1)!.l.startsAt, tz),
          }
        : null;

    // Calendário em lista (DSC-03): da semana passada às próximas seis semanas.
    const from = zonedTimeToUtc(addDays(today, -7), tz);
    const to = zonedTimeToUtc(addDays(today, 42), tz);
    const events: OverviewEvent[] = [
      ...allLessons
        .filter((x) => x.l.startsAt >= from && x.l.startsAt < to)
        .map((x) => ({
          id: x.l.id,
          date: localDayKey(x.l.startsAt, tz),
          time: x.l.allDay ? null : fmt(x.l.startsAt),
          type: x.l.kind,
          title: x.l.title,
          description: x.topic ?? null,
          teacher: x.teacher ?? null,
        })),
      ...assessments
        .filter((a) => a.dueAt && a.dueAt >= from && a.dueAt < to)
        .map((a) => ({
          id: a.id,
          date: localDayKey(a.dueAt!, tz),
          time: a.allDay ? null : fmt(a.dueAt!),
          type: a.kind,
          title: a.name,
          description: a.topicNote,
          teacher: null,
        })),
    ].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));

    const [pendingReminders] = on.lembretes
      ? await tx
          .select({ n: count() })
          .from(s.reminders)
          .where(and(eq(s.reminders.disciplineId, disciplineId), isNull(s.reminders.doneAt)))
      : [{ n: 0 }];

    const rule = await tx.query.attendanceRules.findFirst({
      where: eq(s.attendanceRules.disciplineId, disciplineId),
    });
    const totalLessons = allLessons.filter((x) => x.l.kind !== 'outro');
    const pastLessons = totalLessons.filter((x) => x.l.startsAt < now).length;
    return {
      discipline,
      today,
      period,
      next: next
        ? {
            title: next.l.title,
            date: localDayKey(next.l.startsAt, tz),
            time: next.l.allDay ? null : fmt(next.l.startsAt),
            location: next.l.location,
            teacher: next.teacher ?? null,
          }
        : null,
      events,
      pendingReminders: pendingReminders?.n ?? 0,
      summary: {
        totalClassHours: rule ? Number(rule.totalClassHours) : null,
        lessons: totalLessons.length,
        pastLessons,
        exams: assessments.filter((a) => a.kind === 'prova').length,
        activities: assessments.filter((a) => a.kind !== 'prova').length,
      },
      schedule: discipline.documents.find((d) => d.kind === 'cronograma')?.file ?? null,
      flags: on,
    };
  });
}
