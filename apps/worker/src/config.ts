import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Mesmo papel do app (gutta_app, sem BYPASSRLS). Cada trabalho abre withUser().
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // Prefixo das chaves no Redis: separa ambientes que dividem o mesmo servidor.
  QUEUE_PREFIX: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .default('cognuss'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_RELAY_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  WORKER_CONCURRENCY_SYSTEM: z.coerce.number().int().positive().default(2),
  WORKER_CONCURRENCY_FILES: z.coerce.number().int().positive().default(2),
  WORKER_CONCURRENCY_AI: z.coerce.number().int().positive().default(2),
  WORKER_CONCURRENCY_NOTIFICATIONS: z.coerce.number().int().positive().default(5),
  WORKER_CONCURRENCY_MAINTENANCE: z.coerce.number().int().positive().default(1),
  // Eventos já publicados ficam no outbox por este número de dias (auditoria de entrega).
  OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  // Antivírus (ADR 0012). "clamd" em produção; "none" só em desenvolvimento e testes.
  SCANNER: z.enum(['clamd', 'none']).default('clamd'),
  CLAMD_HOST: z.string().default('clamav'),
  CLAMD_PORT: z.coerce.number().int().positive().default(3310),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida do worker:\n${issues.join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.SCANNER === 'none') {
    throw new Error('Configuração inválida do worker: SCANNER=none não vale em produção');
  }
  return parsed.data;
}
