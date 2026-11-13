import { randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CurrentUser, Role } from '@/lib/auth/session';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const svc = await import('./service');

const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
let admin: CurrentUser;
let student: CurrentUser;

async function user(roles: Role[] = []): Promise<CurrentUser> {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return { id, name: 'Teste', email: `${id}@teste.gutta`, twoFactorEnabled: true, roles };
}

beforeAll(async () => {
  admin = await user(['admin']);
  student = await user();
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
});
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('chaves de funcionalidade', () => {
  it('sem nada gravado, módulo desligado responde 404 na página e na API', async () => {
    expect(await svc.featureEnabled('notas')).toBe(false);
    await expect(svc.requireFeature('notas')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(svc.assertFeature('notas')).rejects.toMatchObject({
      status: 404,
      code: 'feature_disabled',
    });
  });

  it('o admin liga e a mudança vale na hora, com auditoria', async () => {
    await svc.saveFlags(admin, { notas: 'on', faltas: 'on' });
    expect(await svc.featureEnabled('notas')).toBe(true);
    expect(await svc.featureEnabled('agenda')).toBe(false);
    await expect(svc.assertFeature('faltas')).resolves.toBeUndefined();
    const log = await owner.query.auditLogs.findFirst({
      where: and(eq(s.auditLogs.actorId, admin.id), eq(s.auditLogs.action, 'features.updated')),
    });
    expect(log?.metadata).toMatchObject({ notas: true, faltas: true, agenda: false });
  });

  it('quem não é admin não grava (o banco recusa)', async () => {
    await expect(svc.saveFlags(student, { audio: 'on' })).rejects.toThrow();
    expect(await svc.featureEnabled('audio')).toBe(false);
  });
});
