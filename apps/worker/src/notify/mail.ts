import { appendFile } from 'node:fs/promises';
import type { Logger } from '../logger';

// Envio de e-mail do worker (avisos, SPEC v2, LEM-11). Mesmo contrato do app: Resend quando
// houver chave; sem chave, só registro (e arquivo, nos testes). O endereço nunca vai inteiro
// para o log.

export type Mail = { to: string; subject: string; text: string; html: string; tag: string };
export interface Mailer {
  send(m: Mail): Promise<void>;
}

export const maskEmail = (email: string) => {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(user.length - 1, 6)))}@${domain}`;
};

export class LogMailer implements Mailer {
  constructor(
    private log: Logger,
    private outboxFile?: string,
  ) {}
  async send(m: Mail) {
    this.log.info('mail.log', { to: maskEmail(m.to), subject: m.subject, tag: m.tag });
    if (this.outboxFile)
      await appendFile(
        this.outboxFile,
        JSON.stringify({ ...m, at: new Date().toISOString() }) + '\n',
      );
  }
}

export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(m: Mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
        tags: [{ name: 'type', value: m.tag }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status})`);
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** E-mail de um aviso: o título, o detalhe, o link e como desligar. */
export function noticeEmail(
  n: { title: string; body: string | null; link: string | null },
  appUrl: string,
) {
  const url = n.link ? new URL(n.link, appUrl).toString() : appUrl;
  const prefs = new URL('/app/avisos', appUrl).toString();
  const footer = `Você recebe este e-mail porque ligou os avisos por e-mail no Cognuss. Para mudar: ${prefs}`;
  return {
    subject: n.title,
    text: [n.title, n.body ?? '', `Abrir: ${url}`, '', footer].filter((l) => l !== null).join('\n'),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#15201E">
<p style="font-size:13px;color:#56645F">Cognuss</p>
<h1 style="font-size:20px">${esc(n.title)}</h1>
${n.body ? `<p>${esc(n.body)}</p>` : ''}
<p><a href="${esc(url)}">Abrir no Cognuss</a></p>
<p style="font-size:12px;color:#56645F">${esc(footer)}</p></body></html>`,
    tag: 'notice',
  };
}
