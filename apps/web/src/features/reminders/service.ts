import 'server-only';
import { hmToMinute, localDayKey, zonedTimeToUtc } from '@gutta/core';
import type { reminders as contract } from '@gutta/contracts';
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import type { z } from 'zod';
import { notFound } from '@/lib/api';
import { db } from '@/lib/db';
import {
  assertRemindersEnabled,
  removeNotification,
  syncReminderNotification,
} from '@/features/notifications/service';

// Meus lembretes (SPEC v2, LEM-01, 02, 06, 08, 10). "Reservar horário" cria o compromisso que
// ocupa o tempo na agenda e bloqueia o período para o planejamento; "apenas lembrar", não.

type Body = z.output<typeof contract.reminderBody>;
type Row = typeof s.reminders.$inferSelect;

async function tzOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

function toDto(r: Row, tz: string): contract.ReminderDto {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(r.dueAt);
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    disciplineId: r.disciplineId,
    date: localDayKey(r.dueAt, tz),
    start: r.allDay ? null : hm,
    mode: r.mode,
    durationMinutes: r.durationMinutes,
    leadMinutes: r.leadMinutes,
    done: r.doneAt !== null,
    calendarEventId: r.calendarEventId,
  };
}

async function assertDiscipline(tx: Tx, userId: string, id: string | null | undefined) {
  if (!id) return;
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(eq(s.enrolledDisciplines.id, id), eq(s.enrolledDisciplines.ownerId, userId)),
  });
  if (!d) throw notFound('Disciplina');
}

function dueOf(body: Body, tz: string) {
  if (!body.start) return { dueAt: zonedTimeToUtc(body.date, tz), allDay: true };
  const m = hmToMinute(body.start)!;
  return { dueAt: zonedTimeToUtc(body.date, tz, Math.floor(m / 60), m % 60), allDay: false };
}

/** Compromisso do "reservar horário": cria, atualiza ou remove conforme o modo. */
async function syncReservation(tx: Tx, userId: string, body: Body, current: Row | null) {
  const keep = body.mode === 'reservar' && body.start && body.durationMinutes;
  if (!keep) {
    if (current?.calendarEventId)
      await tx.delete(s.calendarEvents).where(eq(s.calendarEvents.id, current.calendarEventId));
    return null;
  }
  const values = {
    kind: 'compromisso' as const,
    title: body.title,
    notes: body.description ?? null,
    disciplineId: body.disciplineId ?? null,
    startDate: body.date,
    startMinute: hmToMinute(body.start!)!,
    durationMinutes: body.durationMinutes!,
    recurrence: null,
    blocksTime: true,
  };
  if (current?.calendarEventId) {
    const [row] = await tx
      .update(s.calendarEvents)
      .set(values)
      .where(eq(s.calendarEvents.id, current.calendarEventId))
      .returning({ id: s.calendarEvents.id });
    if (row) return row.id;
  }
  const [row] = await tx
    .insert(s.calendarEvents)
    .values({ ownerId: userId, ...values })
    .returning({ id: s.calendarEvents.id });
  return row!.id;
}

export async function listReminders(userId: string, status: 'pendentes' | 'feitos' | 'todos') {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await tzOf(tx, userId);
    const rows = await tx
      .select()
      .from(s.reminders)
      .where(
        and(
          eq(s.reminders.ownerId, userId),
          status === 'pendentes'
            ? isNull(s.reminders.doneAt)
            : status === 'feitos'
              ? isNotNull(s.reminders.doneAt)
              : undefined,
        ),
      )
      .orderBy(status === 'feitos' ? desc(s.reminders.dueAt) : asc(s.reminders.dueAt))
      .limit(200);
    return { items: rows.map((r) => toDto(r, tz)) };
  });
}

export async function createReminder(userId: string, body: Body) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const calendarEventId = await syncReservation(tx, userId, body, null);
    const [row] = await tx
      .insert(s.reminders)
      .values({
        ownerId: userId,
        title: body.title,
        description: body.description ?? null,
        category: body.category,
        disciplineId: body.disciplineId ?? null,
        mode: body.mode,
        durationMinutes: body.mode === 'reservar' ? body.durationMinutes : null,
        leadMinutes: body.leadMinutes,
        calendarEventId,
        ...dueOf(body, tz),
      })
      .returning();
    await syncReminderNotification(tx, userId, row!);
    return { reminder: toDto(row!, tz) };
  });
}

async function findOwn(tx: Tx, userId: string, id: string) {
  const row = await tx.query.reminders.findFirst({
    where: and(eq(s.reminders.id, id), eq(s.reminders.ownerId, userId)),
  });
  if (!row) throw notFound('Lembrete');
  return row;
}

export async function updateReminder(userId: string, id: string, body: Body) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    const current = await findOwn(tx, userId, id);
    await assertDiscipline(tx, userId, body.disciplineId);
    const tz = await tzOf(tx, userId);
    const calendarEventId = await syncReservation(tx, userId, body, current);
    const [row] = await tx
      .update(s.reminders)
      .set({
        title: body.title,
        description: body.description ?? null,
        category: body.category,
        disciplineId: body.disciplineId ?? null,
        mode: body.mode,
        durationMinutes: body.mode === 'reservar' ? body.durationMinutes : null,
        leadMinutes: body.leadMinutes,
        calendarEventId,
        ...dueOf(body, tz),
      })
      .where(eq(s.reminders.id, id))
      .returning();
    await syncReminderNotification(tx, userId, row!);
    return { reminder: toDto(row!, tz) };
  });
}

export async function setReminderDone(userId: string, id: string, done: boolean) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    const [row] = await tx
      .update(s.reminders)
      .set({ doneAt: done ? sql`coalesce(${s.reminders.doneAt}, now())` : null })
      .where(eq(s.reminders.id, id))
      .returning();
    await syncReminderNotification(tx, userId, row!);
    return { reminder: toDto(row!, await tzOf(tx, userId)) };
  });
}

export async function removeReminder(userId: string, id: string) {
  await assertRemindersEnabled();
  await withUser(db(), userId, async (tx) => {
    const row = await findOwn(tx, userId, id);
    await removeNotification(tx, userId, `reminder:${id}`);
    await tx.delete(s.reminders).where(eq(s.reminders.id, id));
    if (row.calendarEventId)
      await tx.delete(s.calendarEvents).where(eq(s.calendarEvents.id, row.calendarEventId));
  });
  return { ok: true as const };
}

/** Lembretes com data de hoje, para as tarefas de hoje do Meu Espaço (ESP-03). */
export async function todayReminders(tx: Tx, userId: string, tz: string, today: string) {
  const from = zonedTimeToUtc(today, tz);
  const to = new Date(from.getTime() + 36 * 3600_000);
  const rows = await tx
    .select()
    .from(s.reminders)
    .where(eq(s.reminders.ownerId, userId))
    .orderBy(asc(s.reminders.dueAt));
  return rows
    .filter((r) => r.dueAt >= from && r.dueAt < to && localDayKey(r.dueAt, tz) === today)
    .map((r) => toDto(r, tz));
}
