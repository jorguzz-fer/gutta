import { inQuietHours, localDayKey, localMinute, zonedTimeToUtc } from '@gutta/core';
import { and, count, eq, gte, isNull, schema as s, sql, withUser, type Db } from '@gutta/db';
import type { Logger } from '../logger';
import { noticeEmail, type Mailer } from './mail';

// Envio dos avisos por e-mail (SPEC v2, LEM-11, LEM-12, LEM-14). A função de sistema só diz
// quais avisos venceram para quem ligou o e-mail; cada um é tratado como o dono (withUser),
// com a linha travada, então duas instâncias do worker não mandam o mesmo aviso.

/** Aviso que passou disso sem sair (worker parado, horário silencioso longo) não vai mais. */
const STALE_MS = 24 * 3600_000;

export type DispatchResult = { sent: number; skipped: number; waiting: number; failed: number };

export async function dispatchEmails(deps: {
  db: Db;
  mailer: Mailer;
  log: Logger;
  appUrl: string;
  now?: Date;
  limit?: number;
}): Promise<DispatchResult> {
  const now = deps.now ?? new Date();
  const due = await deps.db.transaction((tx) =>
    tx.execute<{ id: string; owner_id: string }>(
      sql`select * from notifications_email_due(${deps.limit ?? 50})`,
    ),
  );
  const out: DispatchResult = { sent: 0, skipped: 0, waiting: 0, failed: 0 };
  for (const { id, owner_id: userId } of due.rows) {
    try {
      const r = await withUser(deps.db, userId, async (tx) => {
        const [n] = await tx
          .select()
          .from(s.notifications)
          .where(and(eq(s.notifications.id, id), isNull(s.notifications.emailHandledAt)))
          .for('update', { skipLocked: true });
        if (!n) return 'gone' as const;
        const mark = async (status: 'sent' | 'skipped' | 'failed', reason: string | null) => {
          await tx
            .update(s.notifications)
            .set({ emailHandledAt: now })
            .where(eq(s.notifications.id, id));
          await tx
            .insert(s.notificationDeliveries)
            .values({ notificationId: id, ownerId: userId, channel: 'email', status, reason });
        };
        if (now.getTime() - n.scheduledFor.getTime() > STALE_MS) {
          await mark('skipped', 'expirado');
          return 'skipped' as const;
        }
        const prefs = await tx.query.notificationPreferences.findFirst({
          where: eq(s.notificationPreferences.userId, userId),
        });
        if (!prefs?.emailEnabled) return 'gone' as const;
        const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
        const tz = profile?.timezone ?? 'America/Sao_Paulo';
        // Horário silencioso: espera e tenta na próxima volta (LEM-12).
        if (inQuietHours(localMinute(now, tz), prefs.quietFrom, prefs.quietUntil)) {
          return 'waiting' as const;
        }
        // Teto por dia (LEM-14): o resto fica só na plataforma.
        const dayStart = zonedTimeToUtc(localDayKey(now, tz), tz);
        const [sentToday] = await tx
          .select({ n: count() })
          .from(s.notificationDeliveries)
          .where(
            and(
              eq(s.notificationDeliveries.ownerId, userId),
              eq(s.notificationDeliveries.channel, 'email'),
              eq(s.notificationDeliveries.status, 'sent'),
              gte(s.notificationDeliveries.createdAt, dayStart),
            ),
          );
        if ((sentToday?.n ?? 0) >= prefs.dailyCap) {
          await mark('skipped', 'teto diário');
          return 'skipped' as const;
        }
        const user = await tx.query.authUsers.findFirst({ where: eq(s.authUsers.id, userId) });
        if (!user?.email || !user.emailVerified) {
          await mark('skipped', 'sem e-mail confirmado');
          return 'skipped' as const;
        }
        await deps.mailer.send({ to: user.email, ...noticeEmail(n, deps.appUrl) });
        await mark('sent', null);
        return 'sent' as const;
      });
      if (r === 'sent') out.sent++;
      else if (r === 'skipped') out.skipped++;
      else if (r === 'waiting') out.waiting++;
    } catch (err) {
      // Falha do provedor: o aviso fica pendente e tenta de novo na próxima volta.
      out.failed++;
      deps.log.warn('notify.email_failed', { notificationId: id, error: String(err) });
    }
  }
  return out;
}

/** Laço do envio: a cada intervalo, uma volta; erro numa volta não derruba o worker. */
export function startNotifier(deps: Parameters<typeof dispatchEmails>[0] & { intervalMs: number }) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();
  const tick = async () => {
    try {
      const r = await dispatchEmails(deps);
      if (r.sent || r.failed) deps.log.info('notify.dispatched', r);
    } catch (err) {
      deps.log.error('notify.dispatch_failed', { error: String(err) });
    }
    if (!stopped) timer = setTimeout(() => (running = tick()), deps.intervalMs);
  };
  timer = setTimeout(() => (running = tick()), 1000);
  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
