import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://x';
  process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(40);
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.PII_HASH_KEY = randomBytes(32).toString('base64');
});

describe('dado pessoal cifrado', () => {
  it('cifra e decifra; a mesma entrada não gera o mesmo texto cifrado', async () => {
    const { decryptPii, encryptPii } = await import('./pii');
    const a = encryptPii('52998224725');
    const b = encryptPii('52998224725');
    expect(a).not.toBe(b);
    expect(a).not.toContain('52998224725');
    expect(a.startsWith('v1.')).toBe(true);
    expect(decryptPii(a)).toBe('52998224725');
  });

  it('detecta adulteração', async () => {
    const { decryptPii, encryptPii } = await import('./pii');
    const [v, iv, tag, body] = encryptPii('52998224725').split('.');
    const flipped = Buffer.from(body!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptPii([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });

  it('o resumo é estável e não revela o número', async () => {
    const { hashPii } = await import('./pii');
    expect(hashPii('52998224725')).toBe(hashPii('52998224725'));
    expect(hashPii('52998224725')).not.toBe(hashPii('11144477735'));
    expect(hashPii('52998224725')).not.toContain('5299');
  });
});
