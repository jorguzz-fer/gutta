import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUES, type QueueName } from '@gutta/jobs';

// Política padrão de todo trabalho (ADR 0013): 5 tentativas com espera exponencial a partir
// de 5 s. Concluídos somem depois de um dia; os que falharam de vez ficam 30 dias, que é a
// nossa fila de mortos, visível ao admin.
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export type Queues = Record<QueueName, Queue>;

export function createQueues(connection: Redis, prefix: string): Queues {
  const out = {} as Queues;
  for (const name of QUEUES) {
    out[name] = new Queue(name, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  }
  return out;
}

export async function closeQueues(queues: Queues) {
  await Promise.all(Object.values(queues).map((q) => q.close()));
}
