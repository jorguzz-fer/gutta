import { describe, expect, it } from 'vitest';
import type { Db } from '@gutta/db';
import { logger } from '../src/logger';
import type { Mail, Mailer } from '../src/notify/mail';
import { checkSpend, spendAlertEmail } from '../src/notify/spend';

// Alerta de gasto com IA (SPEC v2, 7.7; plano, item 64). A regra de uma vez por mês está na
// função do banco (testada em packages/db); aqui, o envio.
class SpyMailer implements Mailer {
  sent: Mail[] = [];
  async send(m: Mail) {
    if (m.to.startsWith('falha')) throw new Error('provedor fora');
    this.sent.push(m);
  }
}

const fakeDb = (rows: Record<string, string>[]) =>
  ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => ({ rows }) }),
  }) as unknown as Db;

describe('alerta de gasto com IA', () => {
  it('e-mail diz o valor, o limite e que nenhum aluno foi bloqueado', () => {
    const m = spendAlertEmail(
      { period: '2026-11', totalMicros: 61_230_000, thresholdMicros: 50_000_000 },
      'https://cognuss.example',
    );
    expect(m.subject).toMatch(/^Gasto com IA passou de US\$\s50,00 em 2026-11$/);
    expect(m.text).toMatch(/US\$\s61,23/);
    expect(m.text).toContain('Nenhum aluno foi bloqueado');
    expect(m.text).toContain('https://cognuss.example/admin/ia');
  });

  it('envia a cada admin devolvido; falha de um não impede os outros', async () => {
    const mailer = new SpyMailer();
    const row = { period: '2026-11', total_micros: '61230000', threshold_micros: '50000000' };
    const n = await checkSpend({
      db: fakeDb([
        { ...row, email: 'falha@admin.test' },
        { ...row, email: 'ana@admin.test' },
      ]),
      mailer,
      log: logger,
      appUrl: 'https://cognuss.example',
    });
    expect(n).toBe(2);
    expect(mailer.sent.map((m) => m.to)).toEqual(['ana@admin.test']);
  });

  it('nada a avisar: não envia', async () => {
    const mailer = new SpyMailer();
    expect(await checkSpend({ db: fakeDb([]), mailer, log: logger, appUrl: 'https://x' })).toBe(0);
    expect(mailer.sent).toEqual([]);
  });
});
