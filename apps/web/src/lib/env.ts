import 'server-only';
import { z } from 'zod';

// Variáveis do servidor, validadas uma vez. Nenhuma delas vai para o navegador.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET precisa de 32+ caracteres'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Gutta <nao-responda@gutta.tudomudou.com.br>'),
  MAIL_OUTBOX_FILE: z.string().optional(),
  AUTH_RATE_LIMIT: z.enum(['on', 'off']).optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
});

type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Configuração inválida:\n${issues.join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}
