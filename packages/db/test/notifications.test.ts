import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Lembretes e avisos (SPEC v2, 5.11; plano, item 47).
const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let anaNotif: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  anaNotif = await withUser(app, ana, async (tx) => {
    await tx.insert(s.reminders).values({ ownerId: ana, title: 'Ler artigo', dueAt: new Date() });
    await tx.insert(s.notificationPreferences).values({ userId: ana, emailEnabled: true });
    const [n] = await tx
      .insert(s.notifications)
      .values({
        ownerId: ana,
        dedupeKey: 'teste:1',
        type: 'reminder',
        title: 'Ler artigo',
        scheduledFor: new Date(Date.now() - 60_000),
      })
      .returning();
    return n!.id;
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento', () => {
  it('outro aluno não lê lembretes, avisos, entregas nem preferências', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      r: await tx.select().from(s.reminders),
      n: await tx.select().from(s.notifications),
      d: await tx.select().from(s.notificationDeliveries),
      p: await tx.select().from(s.notificationPreferences),
    }));
    expect(seen).toEqual({ r: [], n: [], d: [], p: [] });
  });

  it('entrega só para aviso próprio, e não se altera', async () => {
    const err = await withUser(app, beto, (tx) =>
      tx
        .insert(s.notificationDeliveries)
        .values({ notificationId: anaNotif, ownerId: beto, channel: 'email', status: 'sent' }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    await withUser(app, ana, (tx) =>
      tx
        .insert(s.notificationDeliveries)
        .values({ notificationId: anaNotif, ownerId: ana, channel: 'email', status: 'sent' }),
    );
    const upd = await withUser(app, ana, (tx) =>
      tx.update(s.notificationDeliveries).set({ status: 'failed' }),
    ).catch((e) => e);
    expect(pgCode(upd)).toBe('42501');
  });

  it('a mesma origem não gera dois avisos (LEM-13)', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx.insert(s.notifications).values({
        ownerId: ana,
        dedupeKey: 'teste:1',
        type: 'reminder',
        title: 'De novo',
        scheduledFor: new Date(),
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23505');
  });
});

describe('envio por e-mail', () => {
  it('só o worker (sem usuário no contexto) lista os avisos vencidos', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx.execute(sql`select * from notifications_email_due(10)`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    const rows = await app.transaction((tx) =>
      tx.execute<{ id: string; owner_id: string }>(sql`select * from notifications_email_due(500)`),
    );
    expect(rows.rows.some((r) => r.id === anaNotif && r.owner_id === ana)).toBe(true);
  });

  it('sem e-mail ligado, o aviso não entra na lista', async () => {
    const id = await withUser(app, beto, async (tx) => {
      const [n] = await tx
        .insert(s.notifications)
        .values({
          ownerId: beto,
          dedupeKey: 'x',
          type: 'reminder',
          title: 'X',
          scheduledFor: new Date(Date.now() - 60_000),
        })
        .returning();
      return n!.id;
    });
    const rows = await app.transaction((tx) =>
      tx.execute<{ id: string }>(sql`select * from notifications_email_due(500)`),
    );
    expect(rows.rows.some((r) => r.id === id)).toBe(false);
    await owner.delete(s.notifications).where(eq(s.notifications.id, id));
  });

  it('horário silencioso tem início e fim, ou nenhum', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx
        .update(s.notificationPreferences)
        .set({ quietFrom: 1320 })
        .where(eq(s.notificationPreferences.userId, ana)),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');
  });
});
