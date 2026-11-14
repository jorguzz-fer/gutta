import { sql, type Db } from '@gutta/db';
import type { Logger } from '../logger';
import { maskEmail, type Mailer } from './mail';

// Alerta de gasto com IA (SPEC v2, 7.7): uma volta por hora. A função do banco decide se o
// gasto do mês passou do limite e se o alerta deste mês já saiu; aqui só se envia.

const usd = (micros: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(micros / 1e6);

export function spendAlertEmail(
  a: { period: string; totalMicros: number; thresholdMicros: number },
  appUrl: string,
) {
  const url = new URL('/admin/ia', appUrl).toString();
  const title = `Gasto com IA passou de ${usd(a.thresholdMicros)} em ${a.period}`;
  const body = `O gasto estimado do mês está em ${usd(a.totalMicros)}. Nenhum aluno foi bloqueado. Veja o gasto por recurso e, se precisar, desligue um recurso de IA no admin.`;
  return {
    subject: title,
    text: [title, body, `Abrir: ${url}`].join('\n'),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#15201E">
<p style="font-size:13px;color:#56645F">Cognuss · admin</p>
<h1 style="font-size:20px">${title}</h1>
<p>${body}</p>
<p><a href="${url}">Abrir o painel de IA</a></p></body></html>`,
    tag: 'ai_spend_alert',
  };
}

export async function checkSpend(deps: { db: Db; mailer: Mailer; log: Logger; appUrl: string }) {
  const rows = await deps.db.transaction(async (tx) =>
    (
      await tx.execute<{
        email: string;
        period: string;
        total_micros: string;
        threshold_micros: string;
      }>(sql`select * from ai_spend_alert_check()`)
    ).rows.map((r) => ({
      email: r.email,
      period: r.period,
      totalMicros: Number(r.total_micros),
      thresholdMicros: Number(r.threshold_micros),
    })),
  );
  if (!rows.length) return 0;
  deps.log.warn('ai.spend_alert', {
    period: rows[0]!.period,
    totalMicros: rows[0]!.totalMicros,
    thresholdMicros: rows[0]!.thresholdMicros,
  });
  for (const r of rows) {
    try {
      await deps.mailer.send({ to: r.email, ...spendAlertEmail(r, deps.appUrl) });
    } catch (err) {
      deps.log.error('ai.spend_alert_mail_failed', { to: maskEmail(r.email), error: String(err) });
    }
  }
  return rows.length;
}
