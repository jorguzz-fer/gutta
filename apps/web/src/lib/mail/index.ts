import 'server-only';
import { appendFile } from 'node:fs/promises';
import { env } from '../env';
import { logger } from '../logger';

export type MailMessage = { to: string; subject: string; text: string; html: string; tag: string };

// Interface de envio (SPEC §9.2). Trocar de fornecedor = nova implementação.
export interface MailProvider {
  send(msg: MailMessage): Promise<void>;
}

// Desenvolvimento e testes: não envia nada. Registra no log e, se configurado, num arquivo
// que os testes E2E leem para achar o link de verificação.
class LogMailProvider implements MailProvider {
  constructor(private outboxFile?: string) {}
  async send(msg: MailMessage) {
    logger.info('mail.log', { to: msg.to, subject: msg.subject, tag: msg.tag });
    if (this.outboxFile) {
      await appendFile(
        this.outboxFile,
        JSON.stringify({ ...msg, at: new Date().toISOString() }) + '\n',
      );
    } else {
      console.log(`\n── e-mail (não enviado) para ${msg.to}: ${msg.subject}\n${msg.text}\n`);
    }
  }
}

class ResendMailProvider implements MailProvider {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(msg: MailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        tags: [{ name: 'type', value: msg.tag }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.error('mail.resend_failed', { status: res.status, tag: msg.tag });
      throw new Error(`Falha ao enviar e-mail (${res.status})`);
    }
  }
}

let provider: MailProvider | undefined;
export function mailer(): MailProvider {
  if (!provider) {
    const e = env();
    provider = e.RESEND_API_KEY
      ? new ResendMailProvider(e.RESEND_API_KEY, e.MAIL_FROM)
      : new LogMailProvider(e.MAIL_OUTBOX_FILE);
    if (!e.RESEND_API_KEY && e.NODE_ENV === 'production') {
      logger.warn('mail.no_provider', { msg: 'RESEND_API_KEY ausente: e-mails só vão para o log' });
    }
  }
  return provider;
}
