import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAiSettings } from '../src/ai-settings';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Alerta de gasto com IA (SPEC v2, 7.7; plano, item 64): uma vez por mês, só pelo worker.
const { app, owner, appPool, ownerPool } = connect();

let admin: string;
let aluno: string;

beforeAll(async () => {
  admin = await makeUser(owner, ['admin']);
  aluno = await makeUser(owner);
  await owner.delete(s.aiSpendAlerts);
});

afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'ai'));
  await owner.delete(s.aiSpendAlerts);
  await appPool.end();
  await ownerPool.end();
});

const check = () =>
  app.transaction(async (tx) =>
    (
      await tx.execute<{ email: string; total_micros: string }>(
        sql`select * from ai_spend_alert_check()`,
      )
    ).rows.map((r) => r.email),
  );

describe('alerta de gasto com IA', () => {
  it('sem limite configurado, não alerta', async () => {
    expect(await check()).toEqual([]);
  });

  it('acima do limite, avisa os admins uma vez no mês', async () => {
    await owner
      .insert(s.appSettings)
      .values({ key: 'ai', value: { alertMonthlyUsd: 0.5 } })
      .onConflictDoUpdate({ target: s.appSettings.key, set: { value: { alertMonthlyUsd: 0.5 } } });
    await withUser(app, aluno, (tx) =>
      tx.insert(s.aiUsage).values({
        ownerId: aluno,
        feature: 'tutor_materiais',
        model: 'teste',
        costMicros: 600_000,
      }),
    );
    const emails = await check();
    expect(emails).toContain(`${admin}@teste.gutta`);
    expect(await check()).toEqual([]);
    const [row] = await withUser(app, admin, (tx) => tx.select().from(s.aiSpendAlerts));
    expect(row!.thresholdMicros).toBe(500_000);
    // Aluno não lê o alerta nem chama a função.
    expect(await withUser(app, aluno, (tx) => tx.select().from(s.aiSpendAlerts))).toEqual([]);
    const err = await withUser(app, aluno, (tx) =>
      tx.execute(sql`select * from ai_spend_alert_check()`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });
});

describe('configuração da camada de IA', () => {
  it('lê recursos desligados e ignora valores desconhecidos', async () => {
    const rollback = new Error('desfaz');
    const seen = await owner
      .transaction(async (tx) => {
        await tx
          .insert(s.appSettings)
          .values({ key: 'ai', value: { disabled: ['criacao', 'outro'], alertMonthlyUsd: -1 } })
          .onConflictDoUpdate({
            target: s.appSettings.key,
            set: { value: { disabled: ['criacao', 'outro'], alertMonthlyUsd: -1 } },
          });
        const v = await readAiSettings(tx);
        throw Object.assign(rollback, { v });
      })
      .catch((e) => (e as typeof rollback & { v: unknown }).v);
    expect(seen).toEqual({ alertMonthlyUsd: null, disabled: ['criacao'] });
  });
});
