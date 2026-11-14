import { schema, sql, type Tx } from '@gutta/db';
import { parsePayload, queueOf, type Payload, type Topic } from './topics';

export type EmitOptions = {
  /** Mesmo evento, mesmo trabalho: uma segunda emissão com a mesma chave é ignorada. */
  dedupeKey?: string;
  /** Atraso antes de o worker publicar o evento. */
  delayMs?: number;
};

/**
 * Grava o evento no outbox, dentro da transação de quem chama (ADR 0013). Se a transação
 * desfizer a mudança, o evento some junto; se o Redis estiver fora, o evento espera aqui.
 */
export async function emit<T extends Topic>(
  tx: Tx,
  topic: T,
  payload: Payload<T>,
  opts: EmitOptions = {},
): Promise<void> {
  queueOf(topic);
  const data = parsePayload(topic, payload) as Record<string, unknown>;
  const delay = Math.max(0, Math.floor(opts.delayMs ?? 0));
  await tx
    .insert(schema.outbox)
    .values({
      topic,
      payload: data,
      dedupeKey: opts.dedupeKey ?? null,
      availableAt: delay ? sql`now() + make_interval(secs => ${delay / 1000})` : undefined,
    })
    .onConflictDoNothing();
}
