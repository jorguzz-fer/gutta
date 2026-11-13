import type { Redis } from 'ioredis';

type Rule = { window: number; max: number };
type Decision = { allowed: boolean; retryAfter: number | null };
type Log = { warn: (event: string, fields?: Record<string, unknown>) => void };

// Janela fixa no Redis, atômica: soma 1 e, na primeira vez, marca a expiração da janela.
// Devolve a contagem e quanto falta (ms) para a janela acabar.
const CONSUME = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {n, ttl}
`;

/**
 * Armazenamento do limite de taxa do Better Auth no Redis, compartilhado entre réplicas
 * (pendência do ADR 0006, resolvida no ADR 0013). Se o Redis falhar, a requisição passa e o
 * problema vai para o log: derrubar o login de todo mundo seria pior que perder o limite por
 * alguns instantes.
 */
export function redisRateLimitStorage(client: Redis, log: Log, prefix = 'cognuss:rl:') {
  return {
    async consume(key: string, rule: Rule): Promise<Decision> {
      try {
        const [count, ttl] = (await client.eval(
          CONSUME,
          1,
          prefix + key,
          String(rule.window * 1000),
        )) as [number, number];
        if (count <= rule.max) return { allowed: true, retryAfter: null };
        return { allowed: false, retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
      } catch (err) {
        log.warn('auth.rate_limit_unavailable', { error: String(err) });
        return { allowed: true, retryAfter: null };
      }
    },
  };
}
