import { sql, type Db } from '@gutta/db';
import { jobIdFor, queueOf } from '@gutta/jobs';
import type { Queues } from './queues';
import type { Logger } from './logger';

type Row = {
  id: string | number;
  topic: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
};

/**
 * Publica na fila os eventos pendentes do outbox (ADR 0013). Roda numa transação sem usuário
 * no contexto: as funções outbox_* recusam chamadas feitas de dentro de uma requisição.
 * Se o processo cair entre publicar e marcar, o evento sai de novo na próxima rodada, e o id
 * derivado do evento impede que vire um segundo trabalho.
 */
export async function relayOnce(db: Db, queues: Queues, log: Logger, limit = 100) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', '', true)`);
    const res = await tx.execute(
      sql`select id, topic, payload, dedupe_key from outbox_pending(${limit})`,
    );
    const rows = res.rows as Row[];
    if (rows.length === 0) return 0;
    const published: number[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      let queueName;
      try {
        queueName = queueOf(row.topic);
      } catch {
        // Tópico desconhecido nunca vai ser processado: marca e registra, para não travar a fila.
        log.error('outbox.unknown_topic', { outboxId: id, topic: row.topic });
        published.push(id);
        continue;
      }
      await queues[queueName].add(row.topic, row.payload, {
        jobId: jobIdFor({ id, dedupeKey: row.dedupe_key }),
      });
      published.push(id);
    }
    await tx.execute(sql`select outbox_mark_published(${`{${published.join(',')}}`}::bigint[])`);
    return published.length;
  });
}

export async function pruneOutbox(db: Db, days: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', '', true)`);
    const res = await tx.execute(sql`select outbox_prune(${days}) as n`);
    return Number((res.rows[0] as { n: number } | undefined)?.n ?? 0);
  });
}

/** Laço do relay: uma rodada por intervalo, sem sobrepor rodadas. */
export function startRelay(opts: { db: Db; queues: Queues; log: Logger; intervalMs: number }): {
  stop: () => Promise<void>;
} {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  const tick = async () => {
    if (stopped) return;
    try {
      // Esvazia o que houver antes de esperar o próximo intervalo.
      while (!stopped && (await relayOnce(opts.db, opts.queues, opts.log)) > 0);
    } catch (err) {
      opts.log.error('outbox.relay_failed', { error: String(err) });
    }
    if (!stopped) timer = setTimeout(() => (running = tick()), opts.intervalMs);
  };
  let timer: NodeJS.Timeout | undefined = setTimeout(() => (running = tick()), 0);
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
