import http from 'node:http';
import { createDb, createPool, sql } from '@gutta/db';
import { loadConfig } from './config';
import { storageFromEnv } from '@gutta/storage';
import { ClamdScanner, NoScanner } from './files/scanner';
import { createHandlers } from './handlers';
import { logger } from './logger';
import { closeQueues, createQueues } from './queues';
import { createRedis } from './redis';
import { pruneOutbox, startRelay } from './relay';
import { startWorkers } from './workers';

// Processo worker (ADR 0013): publica o outbox na fila e executa os trabalhos.
async function main() {
  const cfg = loadConfig();
  const storage = storageFromEnv(process.env);
  if (!storage) logger.warn('worker.no_storage', { reason: 'STORAGE_* não configurado' });
  const scanner =
    cfg.SCANNER === 'clamd' ? new ClamdScanner(cfg.CLAMD_HOST, cfg.CLAMD_PORT) : new NoScanner();
  const handlers = createHandlers({ storage, scanner });
  const pool = createPool(cfg.DATABASE_URL, cfg.DB_POOL_MAX);
  const db = createDb(pool);
  // Uma conexão para filas e outra para os workers: comandos bloqueantes não podem segurar
  // a conexão que publica.
  const queueConn = createRedis(cfg.REDIS_URL);
  const workerConn = createRedis(cfg.REDIS_URL);
  const queues = createQueues(queueConn, cfg.QUEUE_PREFIX);
  const workers = startWorkers({
    connection: workerConn,
    prefix: cfg.QUEUE_PREFIX,
    db,
    log: logger,
    handlers,
    concurrency: {
      system: cfg.WORKER_CONCURRENCY_SYSTEM,
      files: cfg.WORKER_CONCURRENCY_FILES,
      ai: cfg.WORKER_CONCURRENCY_AI,
      notifications: cfg.WORKER_CONCURRENCY_NOTIFICATIONS,
      maintenance: cfg.WORKER_CONCURRENCY_MAINTENANCE,
    },
  });
  const relay = startRelay({ db, queues, log: logger, intervalMs: cfg.WORKER_RELAY_INTERVAL_MS });

  const prune = async () => {
    try {
      const n = await pruneOutbox(db, cfg.OUTBOX_RETENTION_DAYS);
      if (n > 0) logger.info('outbox.pruned', { rows: n });
    } catch (err) {
      logger.error('outbox.prune_failed', { error: String(err) });
    }
  };
  const pruneTimer = setInterval(prune, 3600_000);
  void prune();

  // Saúde: banco e Redis respondendo. Só na rede interna do compose.
  const health = http.createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    try {
      await db.execute(sql`select 1`);
      await queueConn.ping();
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
    } catch {
      res.writeHead(503, { 'content-type': 'application/json' }).end('{"status":"down"}');
    }
  });
  health.listen(cfg.WORKER_HEALTH_PORT);
  logger.info('worker.started', { queues: Object.keys(queues), prefix: cfg.QUEUE_PREFIX });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info('worker.stopping', { signal });
    clearInterval(pruneTimer);
    health.close();
    await relay.stop();
    // close() espera os trabalhos em andamento terminarem.
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues(queues);
    await Promise.all([queueConn.quit(), workerConn.quit()]);
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('worker.crashed', { error: String(err) });
  process.exit(1);
});
