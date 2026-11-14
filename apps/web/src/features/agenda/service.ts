import 'server-only';
import {
  addDays,
  localDayKey,
  minuteToHm,
  weekStart,
  projectAgenda,
  zonedTimeToUtc,
  routineSeries,
  type Occurrence,
  type SeriesItem,
  type SingleItem,
} from '@gutta/core';
import type { agenda as contract } from '@gutta/contracts';
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  schema as s,
  withUser,
  type Tx,
} from '@gutta/db';
import { ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';
import { eventSeries, eventsWithExceptions } from '@/features/calendar/service';

// Agenda única (SPEC v2, 7.6 e CAL-14). Lê as tabelas donas de cada fato e projeta tudo pelo
// mesmo serviço do core. Meu Espaço, agenda geral e rotina usam esta leitura; nada é copiado.

export async function assertAgendaEnabled() {
  const on = await flags();
  if (!on.agenda && !on.meu_espaco) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

export async function userTimezone(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

/** Ocorrências do aluno que tocam [from, to), no fuso dele. */
export async function agendaOccurrences(
  tx: Tx,
  userId: string,
  tz: string,
  from: Date,
  to: Date,
): Promise<Occurrence[]> {
  const lessons = await tx
    .select()
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.ownerId, userId),
        lt(s.lessons.startsAt, to),
        or(gte(s.lessons.startsAt, from), gte(s.lessons.endsAt, from)),
        isNull(s.lessons.cancelledAt),
      ),
    );
  // Avaliação de dia inteiro guarda a meia-noite local: um dia antes cobre o fuso.
  const assessments = await tx
    .select()
    .from(s.assessments)
    .where(
      and(
        eq(s.assessments.ownerId, userId),
        isNotNull(s.assessments.dueAt),
        lt(s.assessments.dueAt, to),
        gte(s.assessments.dueAt, new Date(from.getTime() - 86_400_000)),
      ),
    );
  const blocks = await tx.select().from(s.routineBlocks).where(eq(s.routineBlocks.ownerId, userId));
  const { events, exceptions } = await eventsWithExceptions(tx, userId);
  // Compromissos do calendário: lazer e descanso são pessoais (CAL-15); o que ocupa horário
  // fica protegido do planejamento, porque o aluno já reservou o tempo.
  const eventSeriesItems: SeriesItem[] = events.map((e) => ({
    ...eventSeries(e, exceptions),
    source: 'event',
    sourceId: e.id,
    kind: e.kind === 'lazer' || e.kind === 'descanso' ? 'pessoal' : e.kind,
    title: e.title,
    disciplineId: e.disciplineId,
    category: e.kind === 'lazer' || e.kind === 'descanso' ? e.kind : null,
    color: e.color,
    protected: e.blocksTime,
    studyWindow: false,
    blocksTime: e.blocksTime,
    startTime: e.startMinute === null ? null : minuteToHm(e.startMinute),
    durationMinutes: e.durationMinutes,
  }));

  // Lembrete "apenas lembrar" aparece como marca, sem ocupar horário; o "reservar" já está
  // na agenda pelo compromisso que criou (LEM-08, sem duplicar).
  const reminders = await tx
    .select()
    .from(s.reminders)
    .where(
      and(
        eq(s.reminders.ownerId, userId),
        eq(s.reminders.mode, 'lembrar'),
        isNull(s.reminders.doneAt),
        lt(s.reminders.dueAt, to),
        gte(s.reminders.dueAt, new Date(from.getTime() - 86_400_000)),
      ),
    );
  // Sessões de estudo do Equilíbrio: só as confirmadas em diante (R10); a proposta não aparece.
  const sessions = await tx
    .select({ x: s.studySessions, origin: s.studyTasks.origin })
    .from(s.studySessions)
    .leftJoin(s.studyTasks, eq(s.studyTasks.id, s.studySessions.taskId))
    .where(
      and(
        eq(s.studySessions.ownerId, userId),
        inArray(s.studySessions.status, ['confirmed', 'done', 'partly_done']),
        lt(s.studySessions.startsAt, to),
        gt(s.studySessions.endsAt, from),
      ),
    );
  const singles: SingleItem[] = [
    ...sessions.map(({ x, origin }): SingleItem => ({
      source: 'session',
      sourceId: x.id,
      kind: origin && origin !== 'aluno' ? 'revisao' : 'estudo',
      title: x.title,
      disciplineId: x.disciplineId,
      protected: false,
      blocksTime: true,
      start: x.startsAt,
      end: x.endsAt,
      allDay: false,
    })),
    ...lessons.map((l): SingleItem => ({
      source: 'lesson',
      sourceId: l.id,
      kind: l.kind,
      title: l.title,
      disciplineId: l.disciplineId,
      protected: true,
      blocksTime: l.kind !== 'outro',
      start: l.startsAt,
      end: l.endsAt,
      allDay: l.allDay,
    })),
    ...assessments.map((a): SingleItem => ({
      source: 'assessment',
      sourceId: a.id,
      kind: a.kind,
      title: a.name,
      disciplineId: a.disciplineId,
      protected: false,
      blocksTime: false,
      start: a.dueAt!,
      end: null,
      allDay: a.allDay,
    })),
    ...reminders.map((r): SingleItem => ({
      source: 'reminder',
      sourceId: r.id,
      kind: 'compromisso',
      title: r.title,
      disciplineId: r.disciplineId,
      category: 'lembrete',
      protected: false,
      blocksTime: false,
      start: r.dueAt,
      end: null,
      allDay: r.allDay,
    })),
  ];
  return projectAgenda({
    tz,
    from,
    to,
    singles,
    series: [
      ...eventSeriesItems,
      ...blocks.map((b) =>
        routineSeries({
          id: b.id,
          kind: b.kind,
          category: b.category,
          label: b.label,
          disciplineId: b.disciplineId,
          color: b.color,
          weekdays: b.weekdays,
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          validFrom: b.validFrom,
          validUntil: b.validUntil,
        }),
      ),
    ],
  });
}

export function toItemDto(o: Occurrence, tz: string): contract.AgendaItemDto {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return {
    id: o.id,
    source: o.source,
    sourceId: o.sourceId,
    kind: o.kind,
    title: o.title,
    disciplineId: o.disciplineId ?? null,
    category: o.category ?? null,
    color: o.color ?? null,
    date: o.date,
    start: o.start.toISOString(),
    end: o.end.toISOString(),
    startLocal: o.allDay ? null : hm.format(o.start),
    endLocal: o.allDay || o.end.getTime() === o.start.getTime() ? null : hm.format(o.end),
    allDay: o.allDay,
    protected: o.protected,
    studyWindow: o.studyWindow ?? false,
  };
}

export async function getAgenda(userId: string, range: { from: string; to: string }) {
  await assertAgendaEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const from = zonedTimeToUtc(range.from, tz);
    const to = zonedTimeToUtc(addDays(range.to, 1), tz);
    if (to <= from || to.getTime() - from.getTime() > 62 * 86_400_000) {
      throw new ApiError(400, 'invalid_request', 'Escolha um período de até 62 dias.');
    }
    const occ = await agendaOccurrences(tx, userId, tz, from, to);
    return {
      timezone: tz,
      today: localDayKey(new Date(), tz),
      items: occ.map((o) => toItemDto(o, tz)),
    };
  });
}

/** Semana de domingo a sábado: a pedida ou a de hoje no fuso do aluno. */
export async function getAgendaWeek(userId: string, week: string | null) {
  await assertAgendaEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const today = localDayKey(new Date(), tz);
    const start = weekStart(week ?? today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const occ = await agendaOccurrences(
      tx,
      userId,
      tz,
      zonedTimeToUtc(start, tz),
      zonedTimeToUtc(addDays(start, 7), tz),
    );
    return { timezone: tz, today, start, days, items: occ.map((o) => toItemDto(o, tz)) };
  });
}

/** Hoje no fuso do aluno. */
export async function userToday(userId: string) {
  return withUser(db(), userId, async (tx) =>
    localDayKey(new Date(), await userTimezone(tx, userId)),
  );
}
