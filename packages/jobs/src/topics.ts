import { z } from 'zod';

// Catálogo de tópicos (ADR 0013). O tópico é "fila.trabalho": a parte antes do ponto diz em
// que fila o trabalho roda. O payload leva só identificadores; o worker lê o resto do banco
// dentro de withUser(). Nunca colocar texto, arquivo ou dado pessoal aqui.

const id = z.string().min(1).max(200);

export const topics = {
  // Sinal de vida da fila, usado no teste ponta a ponta e no /health do worker.
  'system.ping': z.object({ requestId: id.optional() }),
  // Varrer, conferir o tipo, converter e extrair texto e miniaturas de um arquivo (ADR 0012).
  'files.process': z.object({ fileId: z.uuid(), userId: id, requestId: id.optional() }),
  // Conta excluída: apagar do bucket tudo o que estava sob u/{userId}/ (LGPD, ADR 0009).
  'maintenance.erase_user_objects': z.object({ userId: id }),
} as const;

export type Topic = keyof typeof topics;
export type Payload<T extends Topic> = z.infer<(typeof topics)[T]>;

export const QUEUES = ['system', 'files', 'ai', 'notifications', 'maintenance'] as const;
export type QueueName = (typeof QUEUES)[number];

export function queueOf(topic: string): QueueName {
  const name = topic.split('.')[0];
  if (!(QUEUES as readonly string[]).includes(name ?? '')) {
    throw new Error(`tópico sem fila conhecida: ${topic}`);
  }
  return name as QueueName;
}

export function isTopic(topic: string): topic is Topic {
  return Object.hasOwn(topics, topic);
}

export function parsePayload<T extends Topic>(topic: T, payload: unknown): Payload<T> {
  return topics[topic].parse(payload) as Payload<T>;
}

/**
 * Id do trabalho na fila. Derivado da chave de deduplicação quando houver, para que publicar
 * duas vezes o mesmo evento não gere dois trabalhos. O BullMQ não aceita ":" em ids.
 */
export function jobIdFor(event: { id: number; dedupeKey: string | null }): string {
  const base = event.dedupeKey ?? `outbox-${event.id}`;
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
