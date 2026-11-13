import 'server-only';
import { academicAlerts, minuteToHm, hmToMinute, type AlertSource } from '@gutta/core';
import type { reminders as contract } from '@gutta/contracts';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  like,
  lte,
  notInArray,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { ApiError, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';

// Avisos (SPEC v2, 5.11). Um aviso por origem (LEM-13): lembrete, aula, avaliação ou leitura
// de cronograma. A plataforma mostra o que já chegou; o e-mail é com o worker.

type Prefs = contract.PreferencesDto;
const DEFAULT_PREFS: Prefs = {
  emailEnabled: false,
  quietFrom: null,
  quietUntil: null,
  dailyCap: 10,
  academicAlerts: true,
};

export async function assertRemindersEnabled() {
  const on = await flags();
  if (!on.lembretes) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

export async function prefsOf(tx: Tx, userId: string): Promise<Prefs> {
  const row = await tx.query.notificationPreferences.findFirst({
    where: eq(s.notificationPreferences.userId, userId),
  });
  if (!row) return DEFAULT_PREFS;
  return {
    emailEnabled: row.emailEnabled,
    quietFrom: row.quietFrom === null ? null : minuteToHm(row.quietFrom),
    quietUntil: row.quietUntil === null ? null : minuteToHm(row.quietUntil),
    dailyCap: row.dailyCap,
    academicAlerts: row.academicAlerts,
  };
}

/** Cria ou atualiza o aviso de uma origem; o já lido não volta a aparecer como novo. */
export async function upsertNotification(
  tx: Tx,
  userId: string,
  n: {
    dedupeKey: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    scheduledFor: Date;
  },
) {
  await tx
    .insert(s.notifications)
    .values({ ownerId: userId, ...n })
    .onConflictDoUpdate({
      target: [s.notifications.ownerId, s.notifications.dedupeKey],
      set: {
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        scheduledFor: n.scheduledFor,
        // Mudou a hora: conta como aviso novo, inclusive para o e-mail.
        readAt: sql`case when ${s.notifications.scheduledFor} = ${n.scheduledFor} then ${s.notifications.readAt} else null end`,
        emailHandledAt: sql`case when ${s.notifications.scheduledFor} = ${n.scheduledFor} then ${s.notifications.emailHandledAt} else null end`,
      },
    });
}

export async function removeNotification(tx: Tx, userId: string, dedupeKey: string) {
  await tx
    .delete(s.notifications)
    .where(and(eq(s.notifications.ownerId, userId), eq(s.notifications.dedupeKey, dedupeKey)));
}

/**
 * Refaz os alertas acadêmicos que ainda vão chegar (LEM-15), a partir das aulas e avaliações
 * de agora em diante. Chamado depois de qualquer mudança no cronograma ou no calendário.
 */
export async function syncAcademicAlerts(tx: Tx, userId: string) {
  const prefs = await prefsOf(tx, userId);
  const now = new Date();
  const horizon = new Date(now.getTime() + 120 * 86_400_000);
  let desired: ReturnType<typeof academicAlerts> = [];
  if (prefs.academicAlerts) {
    const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const tz = profile?.timezone ?? 'America/Sao_Paulo';
    const names = new Map(
      (
        await tx
          .select({
            id: s.enrolledDisciplines.id,
            name: s.enrolledDisciplines.name,
            short: s.enrolledDisciplines.shortName,
          })
          .from(s.enrolledDisciplines)
          .where(eq(s.enrolledDisciplines.ownerId, userId))
      ).map((d) => [d.id, d.short || d.name]),
    );
    const lessons = await tx
      .select()
      .from(s.lessons)
      .where(
        and(
          eq(s.lessons.ownerId, userId),
          isNull(s.lessons.cancelledAt),
          gt(s.lessons.startsAt, now),
          lte(s.lessons.startsAt, horizon),
        ),
      );
    const assessments = await tx
      .select()
      .from(s.assessments)
      .where(
        and(
          eq(s.assessments.ownerId, userId),
          gte(s.assessments.dueAt, new Date(now.getTime() - 86_400_000)),
          lte(s.assessments.dueAt, horizon),
        ),
      );
    const sources: AlertSource[] = [
      ...lessons.map((l): AlertSource => ({
        kind: 'lesson',
        id: l.id,
        title: l.title,
        discipline: names.get(l.disciplineId) ?? 'disciplina',
        start: l.startsAt,
        allDay: l.allDay,
        lessonKind: l.kind,
      })),
      ...assessments.map((a): AlertSource => ({
        kind: 'assessment',
        id: a.id,
        name: a.name,
        discipline: names.get(a.disciplineId) ?? 'disciplina',
        due: a.dueAt!,
        allDay: a.allDay,
        assessmentKind: a.kind,
      })),
    ];
    desired = academicAlerts(sources, now, tz);
  }
  const keys = desired.map((d) => d.dedupeKey);
  // Alertas futuros que não valem mais (aula remarcada, prova excluída) saem.
  await tx
    .delete(s.notifications)
    .where(
      and(
        eq(s.notifications.ownerId, userId),
        like(s.notifications.type, 'academic_%'),
        gt(s.notifications.scheduledFor, now),
        keys.length ? notInArray(s.notifications.dedupeKey, keys) : undefined,
      ),
    );
  for (const d of desired) await upsertNotification(tx, userId, d);
}

/** Aviso do lembrete: "reminder:{id}", na antecedência escolhida (LEM-10). */
export async function syncReminderNotification(
  tx: Tx,
  userId: string,
  r: typeof s.reminders.$inferSelect,
) {
  const key = `reminder:${r.id}`;
  if (r.doneAt || r.leadMinutes === null) {
    await removeNotification(tx, userId, key);
    return;
  }
  const at = new Date(r.dueAt.getTime() - r.leadMinutes * 60_000);
  await upsertNotification(tx, userId, {
    dedupeKey: key,
    type: 'reminder',
    title: r.title,
    body: r.description,
    link: '/app/lembretes',
    scheduledFor: at,
  });
}

// ---------- Leitura e preferências ----------

export async function listNotifications(userId: string) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    const now = new Date();
    const rows = await tx
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.ownerId, userId), lte(s.notifications.scheduledFor, now)))
      .orderBy(desc(s.notifications.scheduledFor))
      .limit(50);
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        at: n.scheduledFor.toISOString(),
        read: n.readAt !== null,
      })),
      unread: await unreadCount(tx, userId),
    };
  });
}

async function unreadCount(tx: Tx, userId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.ownerId, userId),
        lte(s.notifications.scheduledFor, new Date()),
        isNull(s.notifications.readAt),
      ),
    );
  return r?.n ?? 0;
}

/** Contador do cabeçalho (LEM-18); zero se o módulo estiver desligado. */
export async function unreadNotifications(userId: string) {
  if (!(await flags()).lembretes) return 0;
  return withUser(db(), userId, (tx) => unreadCount(tx, userId));
}

export async function readNotification(userId: string, id: string) {
  await assertRemindersEnabled();
  await withUser(db(), userId, async (tx) => {
    const [row] = await tx
      .update(s.notifications)
      .set({ readAt: sql`coalesce(${s.notifications.readAt}, now())` })
      .where(and(eq(s.notifications.id, id), eq(s.notifications.ownerId, userId)))
      .returning({ id: s.notifications.id });
    if (!row) throw notFound('Aviso');
  });
  return { ok: true as const };
}

export async function readAllNotifications(userId: string) {
  await assertRemindersEnabled();
  await withUser(db(), userId, (tx) =>
    tx
      .update(s.notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(s.notifications.ownerId, userId),
          isNull(s.notifications.readAt),
          lte(s.notifications.scheduledFor, new Date()),
        ),
      ),
  );
  return { ok: true as const };
}

export async function getPreferences(userId: string) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => ({ preferences: await prefsOf(tx, userId) }));
}

export async function savePreferences(userId: string, p: Prefs) {
  await assertRemindersEnabled();
  return withUser(db(), userId, async (tx) => {
    const values = {
      emailEnabled: p.emailEnabled,
      quietFrom: p.quietFrom ? hmToMinute(p.quietFrom) : null,
      quietUntil: p.quietUntil ? hmToMinute(p.quietUntil) : null,
      dailyCap: p.dailyCap,
      academicAlerts: p.academicAlerts,
    };
    await tx
      .insert(s.notificationPreferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: s.notificationPreferences.userId, set: values });
    await syncAcademicAlerts(tx, userId);
    return { preferences: await prefsOf(tx, userId) };
  });
}
