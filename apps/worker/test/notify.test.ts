import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localMinute } from '@gutta/core';
import { eq, schema as s } from '@gutta/db';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import { logger } from '../src/logger';
import { dispatchEmails } from '../src/notify/dispatch';
import type { Mail, Mailer } from '../src/notify/mail';

// Avisos por e-mail (SPEC v2, LEM-11, LEM-12, LEM-14; plano, item 47).
const { app, owner, appPool, ownerPool } = connect();
const TZ = 'America/Sao_Paulo';

class SpyMailer implements Mailer {
  sent: Mail[] = [];
  fail = false;
  async send(m: Mail) {
    if (this.fail) throw new Error('provedor fora');
    this.sent.push(m);
  }
}

async function student(prefs: Partial<typeof s.notificationPreferences.$inferInsert> = {}) {
  const id = await makeUser(owner);
  await owner
    .insert(s.notificationPreferences)
    .values({ userId: id, emailEnabled: true, ...prefs });
  return id;
}

async function notice(userId: string, title: string, minutesAgo = 1) {
  const [n] = await owner
    .insert(s.notifications)
    .values({
      ownerId: userId,
      dedupeKey: `t:${title}:${Math.random()}`,
      type: 'reminder',
      title,
      body: 'Detalhe',
      link: '/app/lembretes',
      scheduledFor: new Date(Date.now() - minutesAgo * 60_000),
    })
    .returning();
  return n!.id;
}

const row = async (id: string) =>
  (await owner.query.notifications.findFirst({ where: eq(s.notifications.id, id) }))!;
const deliveries = async (id: string) =>
  owner
    .select()
    .from(s.notificationDeliveries)
    .where(eq(s.notificationDeliveries.notificationId, id));
const run = (mailer: Mailer) =>
  dispatchEmails({ db: app, mailer, log: logger, appUrl: 'https://app.teste', limit: 200 });

beforeAll(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('envio de avisos por e-mail', () => {
  it('manda uma vez, com link e como desligar; a segunda volta não repete', async () => {
    const ana = await student();
    const id = await notice(ana, 'Ler o capítulo 3');
    const mailer = new SpyMailer();
    await run(mailer);
    const mine = mailer.sent.filter((m) => m.subject === 'Ler o capítulo 3');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.to).toBe(`${ana}@teste.gutta`);
    expect(mine[0]!.text).toContain('https://app.teste/app/lembretes');
    expect(mine[0]!.text).toContain('https://app.teste/app/avisos');
    expect((await row(id)).emailHandledAt).not.toBeNull();
    expect((await deliveries(id)).map((d) => d.status)).toEqual(['sent']);
    await run(mailer);
    expect(mailer.sent.filter((m) => m.subject === 'Ler o capítulo 3')).toHaveLength(1);
  });

  it('horário silencioso: espera, sem marcar como tratado', async () => {
    const m = localMinute(new Date(), TZ);
    const bia = await student({
      quietFrom: (m + 1440 - 30) % 1440,
      quietUntil: (m + 30) % 1440,
    });
    const id = await notice(bia, 'Silêncio');
    const mailer = new SpyMailer();
    await run(mailer);
    expect(mailer.sent.some((x) => x.subject === 'Silêncio')).toBe(false);
    expect((await row(id)).emailHandledAt).toBeNull();
  });

  it('teto diário: o que passa fica só na plataforma', async () => {
    const caio = await student({ dailyCap: 1 });
    const a = await notice(caio, 'Primeiro', 3);
    const b = await notice(caio, 'Segundo', 2);
    const mailer = new SpyMailer();
    await run(mailer);
    expect(mailer.sent.filter((x) => ['Primeiro', 'Segundo'].includes(x.subject))).toHaveLength(1);
    expect((await deliveries(a)).map((d) => d.status)).toEqual(['sent']);
    expect((await deliveries(b)).map((d) => [d.status, d.reason])).toEqual([
      ['skipped', 'teto diário'],
    ]);
  });

  it('aviso de mais de um dia não sai mais', async () => {
    const dani = await student();
    const id = await notice(dani, 'Antigo', 26 * 60);
    const mailer = new SpyMailer();
    await run(mailer);
    expect(mailer.sent.some((x) => x.subject === 'Antigo')).toBe(false);
    expect((await deliveries(id)).map((d) => d.reason)).toEqual(['expirado']);
  });

  it('e-mail desligado: nada sai; falha do provedor: tenta de novo depois', async () => {
    const edu = await student({ emailEnabled: false });
    const off = await notice(edu, 'Desligado');
    const fe = await student();
    const pending = await notice(fe, 'Vai falhar');
    const mailer = new SpyMailer();
    mailer.fail = true;
    const r = await run(mailer);
    expect(r.failed).toBeGreaterThan(0);
    expect((await row(off)).emailHandledAt).toBeNull();
    expect((await row(pending)).emailHandledAt).toBeNull();
    mailer.fail = false;
    await run(mailer);
    expect(mailer.sent.some((x) => x.subject === 'Vai falhar')).toBe(true);
    expect(mailer.sent.some((x) => x.subject === 'Desligado')).toBe(false);
  });
});
