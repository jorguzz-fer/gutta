import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as s from '../schema';

/** Lê BOOTSTRAP_ADMIN_EMAILS (separados por vírgula ou espaço), já normalizados. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  ];
}

/*
  Primeiro administrador sem depender de e-mail nem de terminal no banco.
  Para cada e-mail listado que já tem conta: marca o e-mail como confirmado e dá o papel
  admin. Idempotente; cada mudança vai para a auditoria. Quem não tem conta é ignorado,
  então a variável não cria usuário nem senha. O 2FA continua obrigatório no /admin.
*/
export async function bootstrapAdmins(db: Db, emails: string[]) {
  if (emails.length === 0) return { verified: [] as string[], granted: [] as string[] };
  return db.transaction(async (tx) => {
    const users = await tx
      .select({ id: s.authUsers.id, verified: s.authUsers.emailVerified })
      .from(s.authUsers)
      .where(inArray(sql`lower(${s.authUsers.email})`, emails));
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return { verified: [], granted: [] };

    const verified = await tx
      .update(s.authUsers)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(and(inArray(s.authUsers.id, ids), eq(s.authUsers.emailVerified, false)))
      .returning({ id: s.authUsers.id });
    const granted = await tx
      .insert(s.roleAssignments)
      .values(ids.map((userId) => ({ userId, role: 'admin' as const })))
      .onConflictDoNothing()
      .returning({ id: s.roleAssignments.userId });

    const audit = [
      ...verified.map((u) => ({ entityId: u.id, action: 'user.email_verified' })),
      ...granted.map((u) => ({ entityId: u.id, action: 'role.granted' })),
    ];
    if (audit.length > 0) {
      await tx.insert(s.auditLogs).values(
        audit.map((a) => ({
          ...a,
          actorId: null,
          entityType: 'user',
          metadata: { source: 'BOOTSTRAP_ADMIN_EMAILS', role: 'admin' },
        })),
      );
    }
    return { verified: verified.map((u) => u.id), granted: granted.map((u) => u.id) };
  });
}
