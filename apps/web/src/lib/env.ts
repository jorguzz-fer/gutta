import 'server-only';
import { z } from 'zod';

// Variáveis do servidor, validadas uma vez. Nenhuma delas vai para o navegador.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET precisa de 32+ caracteres'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Cognuss <nao-responda@gutta.tudomudou.com.br>'),
  MAIL_OUTBOX_FILE: z.string().optional(),
  AUTH_RATE_LIMIT: z.enum(['on', 'off']).optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Redis (ADR 0013): limite de taxa compartilhado. Opcional; sem ele, limite em memória.
  REDIS_URL: z.string().optional(),
  // Liga módulos da v2 sem passar pelo admin (desenvolvimento e E2E): lista ou "all".
  FEATURES_ON: z.string().optional(),
  // Validade do cache das chaves de funcionalidade. O E2E usa 0 para ligar e desligar na hora.
  FLAGS_CACHE_MS: z.coerce.number().int().min(0).default(30_000),
  // Chaves para dado pessoal cifrado (CPF; SPEC v2, CAD-10). 32 bytes em base64 cada.
  PII_ENCRYPTION_KEY: z.string().optional(),
  PII_HASH_KEY: z.string().optional(),
  // Tutor IA. Sem chave, o tutor aparece como indisponível (a não ser com AI_PROVIDER=fake).
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
  TUTOR_MODEL: z.string().default('claude-opus-5-5'),
  // Busca por conceito (ADR 0014): vetores da Voyage AI. Sem chave, só a busca por palavra.
  VOYAGE_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('voyage-4'),
  TUTOR_DAILY_LIMIT: z.coerce.number().int().min(0).max(500).default(20),
  // LGPD: quem é o controlador e o encarregado (art. 41). Sem valor, as páginas avisam que
  // falta definir; não inventamos razão social, CNPJ nem contato.
  LEGAL_CONTROLLER_NAME: z.string().trim().optional(),
  LEGAL_CONTROLLER_DOCUMENT: z.string().trim().optional(),
  DPO_NAME: z.string().trim().optional(),
  DPO_EMAIL: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
