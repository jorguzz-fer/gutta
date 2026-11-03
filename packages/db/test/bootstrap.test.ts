import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import * as s from '../src/schema';
import { bootstrapAdmins, parseAdminEmails } from '../src/scripts/bootstrap-admins';
import { connect, makeUser } from './helpers';

const { owner, appPool, ownerPool } = connect();
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('BOOTSTRAP_ADMIN_EMAILS', () => {
  it('normaliza a lista', () => {
    expect(parseAdminEmails(' A@x.com, b@y.com;a@x.com  sem-arroba ')).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });

  it('confirma o e-mail, dá admin, audita e é idempotente', async () => {
    const id = await makeUser(owner);
    await owner.update(s.authUsers).set({ emailVerified: false }).where(eq(s.authUsers.id, id));
    const [u] = await owner.select().from(s.authUsers).where(eq(s.authUsers.id, id));

    const first = await bootstrapAdmins(owner, [
      u!.email.toUpperCase().toLowerCase(),
      'ninguem@x.com',
    ]);
    expect(first).toEqual({ verified: [id], granted: [id] });

    const [after] = await owner.select().from(s.authUsers).where(eq(s.authUsers.id, id));
    expect(after!.emailVerified).toBe(true);
    const roles = await owner
      .select()
      .from(s.roleAssignments)
      .where(and(eq(s.roleAssignments.userId, id), eq(s.roleAssignments.role, 'admin')));
    expect(roles).toHaveLength(1);
    const audit = await owner.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, id));
    expect(audit.map((a) => a.action).sort()).toEqual(['role.granted', 'user.email_verified']);

    expect(await bootstrapAdmins(owner, [u!.email])).toEqual({ verified: [], granted: [] });
  });

  it('lista vazia não mexe em nada', async () => {
    expect(await bootstrapAdmins(owner, [])).toEqual({ verified: [], granted: [] });
  });
});
