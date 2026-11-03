import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CurrentUser, Role } from '@/lib/auth/session';
import { executeDeletion, privacyOverview, resolveRequest, saveRetention } from './admin';
import { acceptPolicy, currentConsents, requestDeletion, requestRight } from './service';
import { POLICY_VERSION } from './consent';

/*
  Direitos do titular de ponta a ponta no serviço: pedido com prazo, resposta do admin que
  volta para o aluno, exclusão executada pelo admin e prazos de retenção validados.
*/
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
let admin: CurrentUser;
let ana: CurrentUser;

async function user(roles: Role[] = []): Promise<CurrentUser> {
  const id = randomUUID();
  await owner.insert(s.authUsers).values({
    id,
    name: `Pessoa ${id.slice(0, 4)}`,
    email: `${id}@teste.gutta`,
    emailVerified: true,
  });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'P' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return { id, name: 'P', email: `${id}@teste.gutta`, twoFactorEnabled: true, roles };
}

beforeAll(async () => {
  admin = await user(['admin']);
  ana = await user();
});
afterAll(async () => {
  await ownerPool.end();
});

describe('direitos do titular', () => {
  it('pedido de correção: um aberto por tipo, admin responde e a resposta volta para o aluno', async () => {
    await requestRight(ana.id, { kind: 'correction', details: 'Meu sobrenome está errado.' });
    await expect(
      requestRight(ana.id, { kind: 'correction', details: 'De novo o sobrenome.' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(requestRight(ana.id, { kind: 'correction', details: 'curto' })).rejects.toThrow();

    const queue = await privacyOverview(admin);
    const mine = queue.open.find((r) => r.userId === ana.id);
    expect(mine?.kind).toBe('correction');
    expect(mine?.daysLeft).toBe(15);

    await resolveRequest(admin, { id: mine!.id, response: 'Corrigido para Ana Souza.' });
    const c = await currentConsents(ana.id);
    expect(c.requests[0]).toMatchObject({ status: 'done', response: 'Corrigido para Ana Souza.' });
  });

  it('aluno não usa a fila do admin', async () => {
    const r = await requestRight(ana.id, {
      kind: 'information',
      details: 'Com quem vocês compartilham?',
    });
    await expect(
      resolveRequest(ana, { id: r.id, response: 'Respondi eu mesma, pronto.' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('admin executa a exclusão pedida; sem pedido, recusa', async () => {
    const bia = await user();
    await expect(executeDeletion(admin, bia.id)).rejects.toMatchObject({ status: 409 });
    await requestDeletion(bia.id);
    await executeDeletion(admin, bia.id);
    expect(await owner.query.authUsers.findFirst({ where: eq(s.authUsers.id, bia.id) })).toBe(
      undefined,
    );
  });

  it('aceite de nova versão grava termos e política com a versão atual', async () => {
    await acceptPolicy(ana.id);
    const c = await currentConsents(ana.id);
    expect(c.latest.terms).toMatchObject({ granted: true, version: POLICY_VERSION });
    expect(c.latest.privacy).toMatchObject({ granted: true, version: POLICY_VERSION });
  });

  it('prazos de retenção têm limites mínimos e máximos', async () => {
    await expect(
      saveRetention(admin, {
        tutorDays: 5,
        eventsDays: 730,
        auditDays: 1825,
        deletionGraceDays: 15,
      }),
    ).rejects.toThrow(/30 dias/);
    await expect(
      saveRetention(admin, {
        tutorDays: 365,
        eventsDays: 730,
        auditDays: 1825,
        deletionGraceDays: 30,
      }),
    ).rejects.toThrow(/15/);
    await expect(
      saveRetention(ana, {
        tutorDays: 365,
        eventsDays: 730,
        auditDays: 1825,
        deletionGraceDays: 15,
      }),
    ).rejects.toThrow();
  });
});
