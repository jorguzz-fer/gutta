import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import { schema, sql, withUser } from '@gutta/db';
import { emit } from '@gutta/jobs';
import { connect, makeUser, pgCode } from '../../../packages/db/test/helpers';
import { logger } from '../src/logger';
import { closeQueues, createQueues, type Queues } from '../src/queues';
import { createRedis } from '../src/redis';
import { pruneOutbox, relayOnce } from '../src/relay';
import { startWorkers } from '../src/workers';
import type { Handlers } from '../src/handlers/types';
import { createHandlers } from '../src/handlers';
import { NoScanner } from '../src/files/scanner';

const base = () => createHandlers({ storage: null, scanner: new NoScanner(), scheduleExtractor: null });

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const { app, owner, appPool, ownerPool } = connect();
let prefix: string;
let conn: ReturnType<typeof createRedis>;
let queues: Queues;
let userA: string;

beforeAll(async () => {
  userA = await makeUser(owner);
});

beforeEach(async () => {
  // Cada teste com o próprio prefixo no Redis e o outbox vazio.
  prefix = `t${randomUUID().slice(0, 8)}`;
  conn = createRedis(REDIS_URL);
  queues = createQueues(conn, prefix);
  await owner.delete(schema.outbox);
});

afterEach(async () => {
  await Promise.all(Object.values(queues).map((q) => q.obliterate({ force: true })));
  await closeQueues(queues);
  await conn.quit();
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('outbox', () => {
  it('grava o evento na transação do aluno e ignora a mesma chave de novo', async () => {
    await withUser(app, userA, async (tx) => {
      await emit(tx, 'system.ping', { requestId: 'r1' }, { dedupeKey: 'ping-1' });
      await emit(tx, 'system.ping', { requestId: 'r2' }, { dedupeKey: 'ping-1' });
    });
    const rows = await owner.select().from(schema.outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ requestId: 'r1' });
  });

  it('some junto quando a transação é desfeita', async () => {
    await expect(
      withUser(app, userA, async (tx) => {
        await emit(tx, 'system.ping', {});
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');
    expect(await owner.select().from(schema.outbox)).toHaveLength(0);
  });

  it('o app não lê o outbox nem drena a fila de dentro de uma requisição', async () => {
    await withUser(app, userA, (tx) => emit(tx, 'system.ping', {}));
    const read = await withUser(app, userA, (tx) => tx.select().from(schema.outbox)).catch(
      (e) => e,
    );
    expect(pgCode(read)).toBe('42501');
    const err = await withUser(app, userA, (tx) =>
      tx.execute(sql`select * from outbox_pending(10)`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('rejeita payload fora do formato do tópico', async () => {
    await expect(
      withUser(app, userA, (tx) => emit(tx, 'system.ping', { requestId: '' })),
    ).rejects.toThrow();
  });

  it('respeita o atraso pedido', async () => {
    await withUser(app, userA, (tx) => emit(tx, 'system.ping', {}, { delayMs: 60_000 }));
    expect(await relayOnce(app, queues, logger)).toBe(0);
  });
});

describe('relay', () => {
  it('publica uma vez só, com id estável', async () => {
    await withUser(app, userA, (tx) =>
      emit(tx, 'system.ping', { requestId: 'r' }, { dedupeKey: 'ping:abc' }),
    );
    expect(await relayOnce(app, queues, logger)).toBe(1);
    expect(await relayOnce(app, queues, logger)).toBe(0);
    const job = await queues.system.getJob('ping_abc');
    expect(job?.name).toBe('system.ping');
    expect(job?.data).toEqual({ requestId: 'r' });

    // Mesmo evento republicado (processo caiu antes de marcar): não vira um segundo trabalho.
    await owner.execute(sql`update outbox set published_at = null`);
    expect(await relayOnce(app, queues, logger)).toBe(1);
    expect(await queues.system.getJobCounts('waiting', 'delayed')).toMatchObject({ waiting: 1 });
  });

  it('marca e registra tópico desconhecido, sem travar a fila', async () => {
    await owner.insert(schema.outbox).values({ topic: 'fantasma.algo', payload: {} });
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(await relayOnce(app, queues, logger)).toBe(1);
    expect(spy).toHaveBeenCalledWith('outbox.unknown_topic', expect.anything());
    spy.mockRestore();
  });

  it('apaga só os publicados antigos', async () => {
    await owner.insert(schema.outbox).values([
      { topic: 'system.ping', payload: {}, publishedAt: new Date(Date.now() - 10 * 86400_000) },
      { topic: 'system.ping', payload: {}, publishedAt: new Date() },
      { topic: 'system.ping', payload: {} },
    ]);
    expect(await pruneOutbox(app, 7)).toBe(1);
    expect(await owner.select().from(schema.outbox)).toHaveLength(2);
  });
});

describe('worker', () => {
  it('executa o trabalho publicado pelo outbox', async () => {
    const run = vi.fn(async () => {});
    const handlers: Handlers = { ...base(), 'system.ping': { run } };
    const workerConn = createRedis(REDIS_URL);
    const workers = startWorkers({
      connection: workerConn,
      prefix,
      db: app,
      log: logger,
      handlers,
      concurrency: { system: 1, files: 1, ai: 1, notifications: 1, maintenance: 1 },
    });
    const events = new QueueEvents('system', { connection: createRedis(REDIS_URL), prefix });
    await events.waitUntilReady();
    try {
      await withUser(app, userA, (tx) =>
        emit(tx, 'system.ping', { requestId: 'r9' }, { dedupeKey: 'ping-run' }),
      );
      await relayOnce(app, queues, logger);
      const job = await queues.system.getJob('ping-run');
      await job!.waitUntilFinished(events, 10_000);
      expect(run).toHaveBeenCalledWith(
        { requestId: 'r9' },
        expect.objectContaining({ jobId: 'ping-run', attempt: 1 }),
      );
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await events.close();
      await workerConn.quit();
    }
  });

  it('chama onDead quando as tentativas acabam', async () => {
    const onDead = vi.fn(async () => {});
    const handlers: Handlers = {
      ...base(),
      'system.ping': {
        run: async () => {
          throw new Error('quebrou');
        },
        onDead,
      },
    };
    const workerConn = createRedis(REDIS_URL);
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const workers = startWorkers({
      connection: workerConn,
      prefix,
      db: app,
      log: logger,
      handlers,
      concurrency: { system: 1, files: 1, ai: 1, notifications: 1, maintenance: 1 },
    });
    try {
      const q: Queue = queues.system;
      await q.add(
        'system.ping',
        {},
        { jobId: 'morre', attempts: 2, backoff: { type: 'fixed', delay: 10 } },
      );
      await vi.waitFor(() => expect(onDead).toHaveBeenCalled(), { timeout: 10_000 });
      expect(onDead).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ jobId: 'morre' }),
        'quebrou',
      );
      expect(spy).toHaveBeenCalledWith('job.dead', expect.objectContaining({ attempt: 2 }));
      expect((await q.getJob('morre'))?.failedReason).toBe('quebrou');
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await workerConn.quit();
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it('recusa trabalho com payload inválido', async () => {
    const run = vi.fn(async () => {});
    const workerConn = createRedis(REDIS_URL);
    const quiet = [vi.spyOn(logger, 'error'), vi.spyOn(logger, 'warn')].map((s) =>
      s.mockImplementation(() => {}),
    );
    const workers = startWorkers({
      connection: workerConn,
      prefix,
      db: app,
      log: logger,
      handlers: { ...base(), 'system.ping': { run } },
      concurrency: { system: 1, files: 1, ai: 1, notifications: 1, maintenance: 1 },
    });
    try {
      await queues.system.add('system.ping', { requestId: '' }, { jobId: 'invalido', attempts: 1 });
      await vi.waitFor(
        async () =>
          expect(await queues.system.getJob('invalido')).toMatchObject({
            failedReason: expect.any(String),
          }),
        { timeout: 10_000 },
      );
      expect(run).not.toHaveBeenCalled();
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      await workerConn.quit();
      quiet.forEach((s) => s.mockRestore());
    }
  });
});
