import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from './env';

// Dado pessoal sensível guardado cifrado (SPEC v2, CAD-10). AES-256-GCM com chave do
// ambiente; o resumo HMAC-SHA256, com outra chave, permite garantir um CPF por conta sem
// guardar o número em claro. Formato salvo: v1.<iv>.<tag>.<cifrado>, em base64url.

const VERSION = 'v1';

function key(name: 'PII_ENCRYPTION_KEY' | 'PII_HASH_KEY'): Buffer {
  const raw = env()[name];
  if (!raw) throw new Error(`${name} ausente: gere com \`openssl rand -base64 32\``);
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error(`${name} precisa ter 32 bytes em base64`);
  return k;
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('PII_ENCRYPTION_KEY'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, body]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptPii(stored: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !body)
    throw new Error('formato de dado cifrado desconhecido');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key('PII_ENCRYPTION_KEY'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Resumo estável para unicidade. A mesma entrada dá sempre o mesmo resumo. */
export function hashPii(plain: string): string {
  return createHmac('sha256', key('PII_HASH_KEY')).update(plain).digest('base64url');
}
