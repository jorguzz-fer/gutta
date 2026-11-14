import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Db } from '@gutta/db';
import { QUEUES, isTopic, parsePayload, type QueueName, type Topic } from '@gutta/jobs';
import type { Handler, Handlers } from './handlers/types';
import type { Logger } from './logger';

export type Concurrency = Record<QueueName, number>;

async function processJob(job: Job, deps: { db: Db; log: Logger; handlers: Handlers }) {
  if (!isTopic(job.name)) throw new Error(`tópico sem handler: ${job.name}`);
  const topic: Topic = job.name;
  const handler = deps.handlers[topic] as Handler<Topic>;
  const payload = parsePayload(topic, job.data);
  const started = Date.now();
  await handler.run(payload, {
    db: deps.db,
    log: deps.log,
    jobId: String(job.id),
    attempt: job.attemptsMade + 1,
  });
  deps.log.info('job.completed', { topic, jobId: job.id, ms: Date.now() - started });
}

export function startWorkers(opts: {
  connection: Redis;
  prefix: string;
  db: Db;
  log: Logger;
  handlers: Handlers;
  concurrency: Concurrency;
}): Worker[] {
  const { db, log, handlers } = opts;
  return QUEUES.map((name) => {
    const worker = new Worker(name, (job) => processJob(job, { db, log, handlers }), {
      connection: opts.connection,
      prefix: opts.prefix,
      concurrency: opts.concurrency[name],
    });
    worker.on('failed', (job, err) => {
      if (!job) return;
      const attempts = job.opts.attempts ?? 1;
      const dead = job.attemptsMade >= attempts;
      log[dead ? 'error' : 'warn'](dead ? 'job.dead' : 'job.retry', {
        queue: name,
        topic: job.name,
        jobId: job.id,
        attempt: job.attemptsMade,
        error: err.message,
      });
      if (dead && isTopic(job.name)) {
        const handler = handlers[job.name] as Handler<Topic>;
        if (handler.onDead) {
          const ctx = { db, log, jobId: String(job.id), attempt: job.attemptsMade };
          handler
            .onDead(parsePayload(job.name, job.data), ctx, err.message)
            .catch((e) => log.error('job.on_dead_failed', { jobId: job.id, error: String(e) }));
        }
      }
    });
    worker.on('error', (err) => log.error('worker.error', { queue: name, error: err.message }));
    return worker;
  });
}
