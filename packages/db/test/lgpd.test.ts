import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

/*
  LGPD no banco: a exclusão só acontece com pedido aberto da própria pessoa, nunca de admin, e
  leva tudo junto; o aluno não responde o próprio pedido; retenção apaga o texto antigo do tutor
  e executa exclusões vencidas.
*/
const { app, owner, appPool, ownerPool } = connect();
let admin: string;
let student: string;
let moduleId: string;

const DAY = 24 * 60 * 60 * 1000;

async function tutorMessage(studentId: string, at = new Date()) {
  const [conv] = await owner
    .insert(s.tutorConversations)
    .values({ studentId, moduleId })
    .returning();
  await owner.insert(s.tutorMessages).values({
    conversationId: conv!.id,
    studentId,
    role: 'user',
    content: 'Dúvida sobre pós-carga',
    costMicros: 10,
    createdAt: at,
  });
  return conv!.id;
}

beforeAll(async () => {
  admin = await makeUser(owner, ['admin']);
  student = await makeUser(owner);
  const m = await owner.query.modules.findFirst();
  moduleId = m!.id;
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('pedidos do titular', () => {
  it('aluno abre e cancela o pedido, mas não escreve a resposta nem marca como atendido', async () => {
    const [req] = await withUser(app, student, (tx) =>
      tx
        .insert(s.dataRequests)
        .values({ userId: student, kind: 'correction', details: 'Meu nome está errado' })
        .returning(),
    );
    const forged = await withUser(app, student, (tx) =>
      tx
        .update(s.dataRequests)
        .set({ status: 'done', response: 'feito' })
        .where(eq(s.dataRequests.id, req!.id))
        .returning(),
    ).catch((e) => e);
    expect(Array.isArray(forged) ? forged.length : pgCode(forged)).toSatisfy(
      (v: unknown) => v === 0 || v === '42501',
    );
    const insertForged = await withUser(app, student, (tx) =>
      tx.insert(s.dataRequests).values({ userId: student, kind: 'other', response: 'sim' }),
    ).catch((e) => e);
    expect(pgCode(insertForged)).toBe('42501');
    const cancelled = await withUser(app, student, (tx) =>
      tx
        .update(s.dataRequests)
        .set({ status: 'cancelled', resolvedAt: new Date() })
        .where(eq(s.dataRequests.id, req!.id))
        .returning(),
    );
    expect(cancelled).toHaveLength(1);
  });
});

describe('exclusão da conta (erase_user)', () => {
  it('sem pedido aberto, nem admin exclui', async () => {
    const other = await makeUser(owner);
    const err = await withUser(app, admin, (tx) =>
      tx.execute(sql`select erase_user(${other})`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('P0002');
  });

  it('aluno não executa a exclusão de ninguém, nem a própria', async () => {
    await withUser(app, student, (tx) =>
      tx.insert(s.dataRequests).values({ userId: student, kind: 'deletion' }),
    );
    const err = await withUser(app, student, (tx) =>
      tx.execute(sql`select erase_user(${student})`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('admin executa: apaga conta e dados em cascata, anonimiza eventos e deixa auditoria', async () => {
    const gone = await makeUser(owner);
    await tutorMessage(gone);
    await owner.insert(s.productEvents).values({ actorId: gone, eventName: 'teste_lgpd' });
    await withUser(app, gone, (tx) =>
      tx.insert(s.dataRequests).values({ userId: gone, kind: 'deletion' }),
    );
    await withUser(app, admin, (tx) => tx.execute(sql`select erase_user(${gone})`));

    expect(await owner.query.authUsers.findFirst({ where: eq(s.authUsers.id, gone) })).toBe(
      undefined,
    );
    expect(await owner.select().from(s.profiles).where(eq(s.profiles.userId, gone))).toEqual([]);
    expect(
      await owner.select().from(s.tutorMessages).where(eq(s.tutorMessages.studentId, gone)),
    ).toEqual([]);
    expect(
      await owner.select().from(s.productEvents).where(eq(s.productEvents.actorId, gone)),
    ).toEqual([]);
    const log = await owner.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, gone));
    expect(log.map((l) => l.action)).toContain('data.deletion_executed');
    expect(JSON.stringify(log)).not.toContain('@teste.gutta');
  });

  it('conta com papel de admin não é excluída', async () => {
    const otherAdmin = await makeUser(owner, ['admin']);
    await withUser(app, otherAdmin, (tx) =>
      tx.insert(s.dataRequests).values({ userId: otherAdmin, kind: 'deletion' }),
    );
    const err = await withUser(app, admin, (tx) =>
      tx.execute(sql`select erase_user(${otherAdmin})`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');
  });
});

describe('tutor e retenção', () => {
  it('aluno apaga o texto das próprias conversas; tokens e custo ficam', async () => {
    const me = await makeUser(owner);
    const other = await makeUser(owner);
    await tutorMessage(me);
    await tutorMessage(other);
    const res = await withUser(app, me, (tx) =>
      tx.execute<{ n: number }>(sql`select redact_my_tutor_history() as n`),
    );
    expect(Number(res.rows[0]!.n)).toBe(1);
    const [mine] = await owner
      .select()
      .from(s.tutorMessages)
      .where(eq(s.tutorMessages.studentId, me));
    expect(mine!.content).toBe('');
    expect(mine!.redactedAt).not.toBeNull();
    expect(mine!.costMicros).toBe(10);
    const [theirs] = await owner
      .select()
      .from(s.tutorMessages)
      .where(eq(s.tutorMessages.studentId, other));
    expect(theirs!.content).not.toBe('');
  });

  it('retenção apaga texto antigo do tutor e executa exclusão vencida; aluno não roda', async () => {
    const old = await makeUser(owner);
    await tutorMessage(old, new Date(Date.now() - 400 * DAY));
    const leaving = await makeUser(owner);
    await owner
      .insert(s.dataRequests)
      .values({ userId: leaving, kind: 'deletion', createdAt: new Date(Date.now() - 16 * DAY) });
    const fresh = await makeUser(owner);
    await owner.insert(s.dataRequests).values({ userId: fresh, kind: 'deletion' });

    const denied = await withUser(app, student, (tx) =>
      tx.execute(sql`select apply_retention()`),
    ).catch((e) => e);
    expect(pgCode(denied)).toBe('42501');

    const res = await withUser(app, admin, (tx) =>
      tx.execute<{ r: Record<string, number> }>(sql`select apply_retention() as r`),
    );
    expect(res.rows[0]!.r.accountsErased).toBeGreaterThanOrEqual(1);
    const [msg] = await owner
      .select()
      .from(s.tutorMessages)
      .where(eq(s.tutorMessages.studentId, old));
    expect(msg!.content).toBe('');
    expect(await owner.query.authUsers.findFirst({ where: eq(s.authUsers.id, leaving) })).toBe(
      undefined,
    );
    // Pedido recente: a pessoa ainda pode desistir.
    expect(
      await owner.query.authUsers.findFirst({ where: eq(s.authUsers.id, fresh) }),
    ).toBeTruthy();
  });
});
