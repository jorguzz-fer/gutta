import 'server-only';
import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// Conexão do app com o Redis (ADR 0013), hoje só para o limite de taxa compartilhado entre
// réplicas. Sem REDIS_URL, o app segue sem Redis. Com o Redis fora do ar, os comandos falham
// rápido (sem fila offline) e quem chama decide o que fazer.
const g = globalThis as unknown as { __guttaRedis?: Redis | null };

export function redis(): Redis | null {
  if (g.__guttaRedis === undefined) {
    const url = env().REDIS_URL;
    if (!url) {
      g.__guttaRedis = null;
    } else {
      const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2_000,
      });
      client.on('error', (err) => logger.warn('redis.error', { error: err.message }));
      g.__guttaRedis = client;
    }
  }
  return g.__guttaRedis;
}
