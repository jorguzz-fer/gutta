import { Redis } from 'ioredis';

// O BullMQ exige maxRetriesPerRequest: null nas conexões dos workers: um comando bloqueante
// não pode desistir sozinho enquanto o Redis reconecta.
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
