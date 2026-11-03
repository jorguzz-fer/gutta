import 'server-only';
import { and, asc, desc, eq, inArray, ne, schema as s, sql, withUser } from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';
import { RESPONSE_DAYS } from './service';

/*
  Fila LGPD do admin: pedidos do titular com prazo (art. 19), execução da exclusão e prazos
  de retenção. Tudo em withUser com o admin no contexto; exclusão e retenção passam pelas
  funções do banco (erase_user, apply_retention), que conferem o papel de novo.
*/

export type Retention = {
  tutorDays: number;
  eventsDays: number;
  auditDays: number;
  deletionGraceDays: number;
};
export const RETENTION_DEFAULT: Retention = {
  tutorDays: 365,
  eventsDays: 730,
  auditDays: 1825,
  deletionGraceDays: 15,
};

/** Prazos em vigor, para a política pública (app_settings é legível por todos no RLS). */
export async function currentRetention(): Promise<Retention> {
  const row = await db().query.appSettings.findFirst({ where: eq(s.appSettings.key, 'retention') });
  return { ...RETENTION_DEFAULT, ...((row?.value ?? {}) as Partial<Retention>) };
}

export const retentionInput = z.object({
  tutorDays: z.coerce.number().int().min(30, 'Conversas: no mínimo 30 dias.').max(3650),
  eventsDays: z.coerce.number().int().min(90, 'Eventos: no mínimo 90 dias.').max(3650),
  auditDays: z.coerce.number().int().min(365, 'Auditoria: no mínimo 1 ano.').max(3650),
  deletionGraceDays: z.coerce
    .number()
    .int()
    .min(0, 'Use 0 ou mais.')
    .max(15, 'A LGPD dá 15 dias para responder: no máximo 15.'),
});

function dbError(err: unknown): never {
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code === '42501')
    throw new ApiError(403, 'forbidden', 'Sua conta não tem permissão para essa ação.');
  if (cause?.code === 'P0002' || cause?.code === '23514')
    throw new ApiError(
      409,
      'conflict',
      (cause.message ?? 'Não foi possível.').replace(/^./, (c) => c.toUpperCase()) + '.',
    );
  throw err;
}

export async function privacyOverview(admin: CurrentUser) {
  return withUser(db(), admin.id, async (tx) => {
    const open = await tx
      .select({
        id: s.dataRequests.id,
        kind: s.dataRequests.kind,
        details: s.dataRequests.details,
        createdAt: s.dataRequests.createdAt,
        userId: s.dataRequests.userId,
        name: s.authUsers.name,
        email: s.authUsers.email,
      })
      .from(s.dataRequests)
      .innerJoin(s.authUsers, eq(s.authUsers.id, s.dataRequests.userId))
      .where(and(eq(s.dataRequests.status, 'open'), ne(s.dataRequests.kind, 'export')))
      .orderBy(asc(s.dataRequests.createdAt));
    const recent = await tx
      .select({
        id: s.dataRequests.id,
        kind: s.dataRequests.kind,
        status: s.dataRequests.status,
        resolvedAt: s.dataRequests.resolvedAt,
        name: s.authUsers.name,
      })
      .from(s.dataRequests)
      .innerJoin(s.authUsers, eq(s.authUsers.id, s.dataRequests.userId))
      .where(
        and(
          inArray(s.dataRequests.status, ['done', 'cancelled']),
          ne(s.dataRequests.kind, 'export'),
        ),
      )
      .orderBy(desc(s.dataRequests.resolvedAt))
      .limit(20);
    const [counts] = await tx
      .select({
        exports30d: sql<number>`count(*) FILTER (WHERE ${s.dataRequests.kind} = 'export' AND ${s.dataRequests.createdAt} > now() - interval '30 days')::int`,
      })
      .from(s.dataRequests);
    const erased = await tx
      .select({ at: s.auditLogs.createdAt, metadata: s.auditLogs.metadata })
      .from(s.auditLogs)
      .where(eq(s.auditLogs.action, 'data.deletion_executed'))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(10);
    const lastRun = await tx
      .select({ at: s.auditLogs.createdAt, metadata: s.auditLogs.metadata })
      .from(s.auditLogs)
      .where(eq(s.auditLogs.action, 'data.retention_applied'))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(1);
    const row = await tx.query.appSettings.findFirst({
      where: eq(s.appSettings.key, 'retention'),
    });
    // Prazo legal de resposta (art. 19): calculado aqui, não na renderização.
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    return {
      open: open.map((r) => {
        const dueAt = new Date(r.createdAt.getTime() + RESPONSE_DAYS * DAY);
        return { ...r, dueAt, daysLeft: Math.ceil((dueAt.getTime() - now) / DAY) };
      }),
      recent,
      exports30d: counts?.exports30d ?? 0,
      erased,
      lastRun: lastRun[0] ?? null,
      retention: { ...RETENTION_DEFAULT, ...((row?.value ?? {}) as Partial<Retention>) },
    };
  });
}

export const resolveInput = z.object({
  id: z.uuid(),
  response: z
    .string()
    .trim()
    .min(10, 'Escreva a resposta para a pessoa (ela aparece em Privacidade).')
    .max(4000),
});

/** Responde um pedido (correção, informação, oposição, outro). A resposta vai para o aluno. */
export async function resolveRequest(admin: CurrentUser, raw: unknown) {
  const v = resolveInput.parse(raw);
  try {
    await resolveWith(admin, v);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    dbError(err);
  }
}

async function resolveWith(admin: CurrentUser, v: z.infer<typeof resolveInput>) {
  return withUser(db(), admin.id, async (tx) => {
    const [row] = await tx
      .update(s.dataRequests)
      .set({ status: 'done', response: v.response, resolvedBy: admin.id, resolvedAt: new Date() })
      .where(
        and(
          eq(s.dataRequests.id, v.id),
          eq(s.dataRequests.status, 'open'),
          ne(s.dataRequests.kind, 'deletion'),
        ),
      )
      .returning({ userId: s.dataRequests.userId, kind: s.dataRequests.kind });
    if (!row) throw notFound('Pedido aberto');
    await audit(
      tx,
      admin.id,
      'data.request_resolved',
      { type: 'user', id: row.userId },
      { kind: row.kind },
    );
  });
}

/** Executa a exclusão pedida pela pessoa, sem esperar o prazo. Não tem volta. */
export async function executeDeletion(admin: CurrentUser, userId: string) {
  try {
    await withUser(db(), admin.id, (tx) => tx.execute(sql`SELECT erase_user(${userId})`));
  } catch (err) {
    dbError(err);
  }
}

export async function saveRetention(admin: CurrentUser, raw: unknown) {
  const v = retentionInput.parse(raw);
  await withUser(db(), admin.id, async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({ key: 'retention', value: v, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value: v, updatedBy: admin.id, updatedAt: new Date() },
      });
    await audit(
      tx,
      admin.id,
      'retention.settings_updated',
      { type: 'app_settings', id: 'retention' },
      v,
    );
  });
}

export type RetentionResult = {
  tutorMessagesRedacted: number;
  eventsDeleted: number;
  auditDeleted: number;
  sessionsDeleted: number;
  tokensDeleted: number;
  accountsErased: number;
  accountsSkipped: number;
};

export async function runRetention(admin: CurrentUser): Promise<RetentionResult> {
  try {
    return await withUser(db(), admin.id, async (tx) => {
      const res = await tx.execute<{ r: RetentionResult }>(sql`SELECT apply_retention() AS r`);
      return res.rows[0]!.r;
    });
  } catch (err) {
    dbError(err);
  }
}
