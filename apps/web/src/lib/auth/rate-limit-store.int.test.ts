import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { redisRateLimitStorage } from './rate-limit-store';

const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const log = { warn: vi.fn() };

afterAll(async () => {
  await client.quit();
});

describe('limite de taxa no Redis', () => {
  it('deixa passar até o máximo e barra o resto, com o tempo de espera', async () => {
    const store = redisRateLimitStorage(client, log, `t${randomUUID()}:`);
    const rule = { window: 60, max: 3 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await store.consume('1.2.3.4|/sign-in/email', rule));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[4]!.retryAfter).toBeGreaterThan(0);
    expect(results[4]!.retryAfter).toBeLessThanOrEqual(60);
  });

  it('conta separado por chave e é compartilhado entre instâncias', async () => {
    const prefix = `t${randomUUID()}:`;
    const a = redisRateLimitStorage(client, log, prefix);
    const other = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const b = redisRateLimitStorage(other, log, prefix);
    const rule = { window: 60, max: 2 };
    expect((await a.consume('ip-1', rule)).allowed).toBe(true);
    expect((await b.consume('ip-1', rule)).allowed).toBe(true);
    expect((await a.consume('ip-1', rule)).allowed).toBe(false);
    expect((await b.consume('ip-2', rule)).allowed).toBe(true);
    await other.quit();
  });

  it('a janela recomeça quando expira', async () => {
    const store = redisRateLimitStorage(client, log, `t${randomUUID()}:`);
    const rule = { window: 1, max: 1 };
    expect((await store.consume('k', rule)).allowed).toBe(true);
    expect((await store.consume('k', rule)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await store.consume('k', rule)).allowed).toBe(true);
  });

  it('com o Redis fora do ar, deixa passar e registra', async () => {
    const down = new Redis('redis://localhost:1', {
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    const warn = vi.fn();
    const store = redisRateLimitStorage(down, { warn });
    expect(await store.consume('k', { window: 60, max: 1 })).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(warn).toHaveBeenCalledWith('auth.rate_limit_unavailable', expect.anything());
    down.disconnect();
  });
});
