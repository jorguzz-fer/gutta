import 'server-only';
import {
  durationBetween,
  endSeriesBefore,
  hmToMinute,
  isOccurrence,
  localDayKey,
  minuteToHm,
  splitSeries,
  zonedTimeToUtc,
  type OccurrenceChange,
  type RecurrenceRule,
  type Series,
} from '@gutta/core';
import type { calendar as contract } from '@gutta/contracts';
import { and, eq, gte, inArray, isNull, schema as s, sql, withUser, type Tx } from '@gutta/db';
import type { z } from 'zod';
import { ApiError, badRequest, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';
import { syncAcademicAlerts } from '@/features/notifications/service';

// Calendário (SPEC v2, CAL-02 a CAL-07, CAL-16). Compromissos com recorrência e exceções;
// aulas e avaliações editadas no lugar delas, marcando o que o aluno mudou no que veio do
// cronograma. Nada é copiado entre tabelas.

type EventBody = z.output<typeof contract.eventBody>;
type LessonBody = z.output<typeof contract.lessonBody>;
type AssessmentBody = z.output<typeof contract.assessmentBody>;
type EventRow = typeof s.calendarEvents.$inferSelect;
type ExceptionRow = typeof s.calendarEventExceptions.$inferSelect;

export async function assertCalendarEnabled() {
  const on = await flags();
  if (!on.agenda) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function tzOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

async function assertDiscipline(tx: Tx, userId: string, id: string | null | undefined) {
  if (!id) return;
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(eq(s.enrolledDisciplines.id, id), eq(s.enrolledDisciplines.ownerId, userId)),
  });
  if (!d) throw notFound('Disciplina');
}

// ---------- Compromissos ----------

function normalizeRule(r: EventBody['recurrence']): RecurrenceRule | null {
  if (!r) return null;
  if (r.freq === 'weekly')
    return { freq: 'weekly', weekdays: [...new Set(r.weekdays)].sort(), until: r.until ?? null };
  if (r.freq === 'dates') return { freq: 'dates', dates: [...new Set(r.dates)].sort() };
  return { freq: r.freq, until: r.until ?? null };
}

function eventValues(body: EventBody) {
  const start = body.start ? hmToMinute(body.start) : null;
  const end = body.end ? hmToMinute(body.end) : null;
  return {
    kind: body.kind,
    title: body.title,
    notes: body.notes ?? null,
    disciplineId: body.disciplineId ?? null,
    color: body.color ?? null,
    blocksTime: body.blocksTime,
    startDate: body.date,
    startMinute: start,
    durationMinutes: start !== null && end !== null ? durationBetween(start, end) : 1440,
    recurrence: normalizeRule(body.recurrence) as Record<string, unknown> | null,
  };
}

export function toEventDto(e: EventRow): contract.EventDto {
  return {
    id: e.id,
    kind: e.kind,
    title: e.title,
    notes: e.notes,
    disciplineId: e.disciplineId,
    color: e.color,
    blocksTime: e.blocksTime,
    date: e.startDate,
    start: e.startMinute === null ? null : minuteToHm(e.startMinute),
    end: e.startMinute === null ? null : minuteToHm(e.startMinute + e.durationMinutes),
    recurrence: (e.recurrence as contract.EventDto['recurrence']) ?? null,
  };
}

/** Série do core a partir da linha e das exceções (para a agenda e para dividir). */
export function eventSeries(e: EventRow, exceptions: ExceptionRow[]): Series {
  return {
    startDate: e.startDate,
    rule: (e.recurrence as RecurrenceRule | null) ?? null,
    exceptions: exceptions
      .filter((x) => x.eventId === e.id)
      .map((x) => ({
        date: x.occurrenceDate,
        cancelled: x.cancelled,
        change: (x.change as OccurrenceChange | null) ?? undefined,
      })),
  };
}

async function findEvent(tx: Tx, userId: string, id: string) {
  const row = await tx.query.calendarEvents.findFirst({
    where: and(eq(s.calendarEvents.id, id), eq(s.calendarEvents.ownerId, userId)),
  });
  if (!row) throw notFound('Compromisso');
  return row;
}

export async function createEvent(userId: string, body: EventBody) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    await assertDiscipline(tx, userId, body.disciplineId);
    const [row] = await tx
      .insert(s.calendarEvents)
      .values({ ownerId: userId, ...eventValues(body) })
      .returning();
    return { event: toEventDto(row!) };
  });
}

export async function getEvent(userId: string, id: string) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => ({
    event: toEventDto(await findEvent(tx, userId, id)),
  }));
}

export async function updateEvent(
  userId: string,
  id: string,
  input: { scope: 'this' | 'following' | 'all'; occurrenceDate?: string; event: EventBody },
) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    const row = await findEvent(tx, userId, id);
    await assertDiscipline(tx, userId, input.event.disciplineId);
    const values = eventValues(input.event);
    const series = eventSeries(row, []);
    const date = input.occurrenceDate;
    const recurring = Boolean(row.recurrence);
    if (recurring && input.scope !== 'all') {
      if (!date || !isOccurrence(series, date))
        throw badRequest('Escolha uma ocorrência da série.');
    }

    // Só esta: exceção com o novo dia, horário e título.
    if (recurring && input.scope === 'this') {
      const change = {
        date: values.startDate,
        start: values.startMinute === null ? null : minuteToHm(values.startMinute),
        durationMinutes: values.durationMinutes,
        title: values.title,
      };
      await tx
        .insert(s.calendarEventExceptions)
        .values({ eventId: id, ownerId: userId, occurrenceDate: date!, change })
        .onConflictDoUpdate({
          target: [s.calendarEventExceptions.eventId, s.calendarEventExceptions.occurrenceDate],
          set: { change, cancelled: false },
        });
      return { event: toEventDto(row) };
    }

    // Esta e as próximas: a série antiga acaba na véspera; a nova começa com o que mudou.
    if (recurring && input.scope === 'following' && date !== row.startDate) {
      const { before } = splitSeries(series, date!);
      await tx
        .update(s.calendarEvents)
        .set({ recurrence: before!.rule as Record<string, unknown> })
        .where(eq(s.calendarEvents.id, id));
      await tx
        .delete(s.calendarEventExceptions)
        .where(
          and(
            eq(s.calendarEventExceptions.eventId, id),
            gte(s.calendarEventExceptions.occurrenceDate, date!),
          ),
        );
      const [created] = await tx
        .insert(s.calendarEvents)
        .values({ ownerId: userId, ...values })
        .returning();
      return { event: toEventDto(created!) };
    }

    // Toda a série (ou evento único). Mudou o dia ou a regra: as exceções antigas perdem o
    // sentido e saem.
    const reshaped =
      values.startDate !== row.startDate ||
      JSON.stringify(values.recurrence) !== JSON.stringify(row.recurrence);
    const [updated] = await tx
      .update(s.calendarEvents)
      .set(values)
      .where(eq(s.calendarEvents.id, id))
      .returning();
    if (reshaped)
      await tx.delete(s.calendarEventExceptions).where(eq(s.calendarEventExceptions.eventId, id));
    return { event: toEventDto(updated!) };
  });
}

export async function removeEvent(
  userId: string,
  id: string,
  scope: 'this' | 'following' | 'all',
  date?: string,
) {
  await assertCalendarEnabled();
  await withUser(db(), userId, async (tx) => {
    const row = await findEvent(tx, userId, id);
    const series = eventSeries(row, []);
    if (!row.recurrence || scope === 'all') {
      await tx.delete(s.calendarEvents).where(eq(s.calendarEvents.id, id));
      return;
    }
    if (!date || !isOccurrence(series, date)) throw badRequest('Escolha uma ocorrência da série.');
    if (scope === 'this') {
      await tx
        .insert(s.calendarEventExceptions)
        .values({ eventId: id, ownerId: userId, occurrenceDate: date, cancelled: true })
        .onConflictDoUpdate({
          target: [s.calendarEventExceptions.eventId, s.calendarEventExceptions.occurrenceDate],
          set: { cancelled: true, change: null },
        });
      return;
    }
    const rest = endSeriesBefore(series, date);
    if (!rest) {
      await tx.delete(s.calendarEvents).where(eq(s.calendarEvents.id, id));
      return;
    }
    await tx
      .update(s.calendarEvents)
      .set({ recurrence: rest.rule as Record<string, unknown> })
      .where(eq(s.calendarEvents.id, id));
    await tx
      .delete(s.calendarEventExceptions)
      .where(
        and(
          eq(s.calendarEventExceptions.eventId, id),
          gte(s.calendarEventExceptions.occurrenceDate, date),
        ),
      );
  });
  return { ok: true as const };
}

/** Compromissos e exceções do aluno, para a agenda. */
export async function eventsWithExceptions(tx: Tx, userId: string) {
  const events = await tx
    .select()
    .from(s.calendarEvents)
    .where(eq(s.calendarEvents.ownerId, userId));
  const exceptions = events.length
    ? await tx
        .select()
        .from(s.calendarEventExceptions)
        .where(
          inArray(
            s.calendarEventExceptions.eventId,
            events.map((e) => e.id),
          ),
        )
    : [];
  return { events, exceptions };
}

// ---------- Aulas ----------

type LessonRow = typeof s.lessons.$inferSelect;

function localParts(d: Date, tz: string) {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return { date: localDayKey(d, tz), hm };
}

function toLessonDto(l: LessonRow, tz: string) {
  const s0 = localParts(l.startsAt, tz);
  return {
    id: l.id,
    disciplineId: l.disciplineId,
    kind: l.kind,
    title: l.title,
    location: l.location,
    date: s0.date,
    start: l.allDay ? null : s0.hm,
    end: l.allDay || !l.endsAt ? null : localParts(l.endsAt, tz).hm,
    origin: l.origin,
    modifiedByStudent: l.modifiedByStudent,
    original: l.original ?? null,
  };
}

function instants(body: { date: string; start: string | null; end?: string | null }, tz: string) {
  if (!body.start) return { startsAt: zonedTimeToUtc(body.date, tz), endsAt: null, allDay: true };
  const a = hmToMinute(body.start)!;
  const startsAt = zonedTimeToUtc(body.date, tz, Math.floor(a / 60), a % 60);
  if (!body.end) return { startsAt, endsAt: null, allDay: false };
  const dur = durationBetween(a, hmToMinute(body.end)!);
  return { startsAt, endsAt: new Date(startsAt.getTime() + dur * 60_000), allDay: false };
}

async function findLesson(tx: Tx, userId: string, id: string) {
  const row = await tx.query.lessons.findFirst({
    where: and(eq(s.lessons.id, id), eq(s.lessons.ownerId, userId), isNull(s.lessons.cancelledAt)),
  });
  if (!row) throw notFound('Aula');
  return row;
}

export async function createLesson(userId: string, body: LessonBody) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const [row] = await tx
      .insert(s.lessons)
      .values({
        ownerId: userId,
        disciplineId: body.disciplineId,
        kind: body.kind,
        title: body.title,
        location: body.location ?? null,
        origin: 'manual',
        ...instants(body, tz),
      })
      .returning();
    await syncAcademicAlerts(tx, userId);
    return { lesson: toLessonDto(row!, tz) };
  });
}

export async function updateLesson(userId: string, id: string, body: LessonBody) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    const row = await findLesson(tx, userId, id);
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const [updated] = await tx
      .update(s.lessons)
      .set({
        disciplineId: body.disciplineId,
        kind: body.kind,
        title: body.title,
        location: body.location ?? null,
        ...instants(body, tz),
        // O que veio do cronograma e o aluno mudou não é sobrescrito no próximo (DIS-07).
        modifiedByStudent: row.origin === 'imported' ? true : row.modifiedByStudent,
      })
      .where(eq(s.lessons.id, id))
      .returning();
    await syncAcademicAlerts(tx, userId);
    return { lesson: toLessonDto(updated!, tz) };
  });
}

export async function removeLesson(userId: string, id: string) {
  await assertCalendarEnabled();
  await withUser(db(), userId, async (tx) => {
    const row = await findLesson(tx, userId, id);
    if (row.origin === 'imported') {
      await tx
        .update(s.lessons)
        .set({ cancelledAt: sql`now()`, modifiedByStudent: true })
        .where(eq(s.lessons.id, id));
    } else {
      await tx.delete(s.lessons).where(eq(s.lessons.id, id));
    }
    await syncAcademicAlerts(tx, userId);
  });
  return { ok: true as const };
}

// ---------- Avaliações ----------

type AssessmentRow = typeof s.assessments.$inferSelect;

function toAssessmentDto(a: AssessmentRow, tz: string) {
  const p = a.dueAt ? localParts(a.dueAt, tz) : null;
  return {
    id: a.id,
    disciplineId: a.disciplineId,
    kind: a.kind,
    name: a.name,
    topicNote: a.topicNote,
    date: p?.date ?? null,
    start: p && !a.allDay ? p.hm : null,
    origin: a.origin,
    modifiedByStudent: a.modifiedByStudent,
    original: a.original ?? null,
  };
}

async function findAssessment(tx: Tx, userId: string, id: string) {
  const row = await tx.query.assessments.findFirst({
    where: and(eq(s.assessments.id, id), eq(s.assessments.ownerId, userId)),
  });
  if (!row) throw notFound('Avaliação');
  return row;
}

export async function createAssessment(userId: string, body: AssessmentBody) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const t = instants(body, tz);
    const [row] = await tx
      .insert(s.assessments)
      .values({
        ownerId: userId,
        disciplineId: body.disciplineId,
        kind: body.kind,
        name: body.name,
        topicNote: body.topicNote ?? null,
        dueAt: t.startsAt,
        allDay: t.allDay,
        origin: 'manual',
      })
      .returning();
    await syncAcademicAlerts(tx, userId);
    return { assessment: toAssessmentDto(row!, tz) };
  });
}

export async function updateAssessment(userId: string, id: string, body: AssessmentBody) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => {
    const row = await findAssessment(tx, userId, id);
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const t = instants(body, tz);
    const [updated] = await tx
      .update(s.assessments)
      .set({
        disciplineId: body.disciplineId,
        kind: body.kind,
        name: body.name,
        topicNote: body.topicNote ?? null,
        dueAt: t.startsAt,
        allDay: t.allDay,
        modifiedByStudent: row.origin === 'imported' ? true : row.modifiedByStudent,
      })
      .where(eq(s.assessments.id, id))
      .returning();
    await syncAcademicAlerts(tx, userId);
    return { assessment: toAssessmentDto(updated!, tz) };
  });
}

export async function removeAssessment(userId: string, id: string) {
  await assertCalendarEnabled();
  await withUser(db(), userId, async (tx) => {
    await findAssessment(tx, userId, id);
    await tx.delete(s.assessments).where(eq(s.assessments.id, id));
    await syncAcademicAlerts(tx, userId);
  });
  return { ok: true as const };
}

/** Leitura de uma aula ou avaliação para o formulário de edição. */
export async function getLesson(userId: string, id: string) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => ({
    lesson: toLessonDto(await findLesson(tx, userId, id), await tzOf(tx, userId)),
  }));
}
export async function getAssessment(userId: string, id: string) {
  await assertCalendarEnabled();
  return withUser(db(), userId, async (tx) => ({
    assessment: toAssessmentDto(await findAssessment(tx, userId, id), await tzOf(tx, userId)),
  }));
}
