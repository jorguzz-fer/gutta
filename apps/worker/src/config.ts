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
  // Produção de aulas (ADR 0021): conversão pesada e plano longo, um de cada vez.
  WORKER_CONCURRENCY_PRODUCTION: z.coerce.number().int().positive().default(1),
  // Eventos já publicados ficam no outbox por este número de dias (auditoria de entrega).
  OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  // Antivírus (ADR 0012). "clamd" em produção; "none" só em desenvolvimento e testes.
  SCANNER: z.enum(['clamd', 'none']).default('clamd'),
  CLAMD_HOST: z.string().default('clamav'),
  CLAMD_PORT: z.coerce.number().int().positive().default(3310),
  // IA (SPEC v2, 7.7), como no web. Sem chave, a leitura automática fica indisponível e o
  // aluno é avisado. "fake" lê só linhas de teste e não vale em produção.
  AI_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_SCHEDULE_MODEL: z.string().default('claude-opus-5-5'),
  AI_SCHEDULE_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  // Criações da Ajuda Cognuss (ADR 0020).
  AI_CREATION_MODEL: z.string().default('claude-opus-5-5'),
  AI_CREATION_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  // Plano das peças da produção de aulas (ADR 0021): aula inteira, com imagens dos slides.
  AI_PRODUCTION_MODEL: z.string().default('claude-opus-5-5'),
  AI_PRODUCTION_EFFORT: z.enum(['low', 'medium', 'high']).default('high'),
  // Peças HTML da produção de aulas (Fase 2) e o Chromium do teste de render.
  AI_PIECE_MODEL: z.string().default('claude-opus-5-5'),
  AI_PIECE_EFFORT: z.enum(['low', 'medium', 'high']).default('high'),
  PIECE_CHROMIUM_PATH: z.string().optional(),
  // Vídeos da produção de aulas (Fase 3). Higgsfield para imagem e clipe, ElevenLabs para a
  // narração. Sem chave, a tarefa pausa com o aviso no admin. "fake" gera tudo com o ffmpeg,
  // sem rede, e não vale em produção.
  MEDIA_PROVIDER: z.enum(['higgsfield', 'fake']).default('higgsfield'),
  HIGGSFIELD_API_KEY_ID: z.string().optional(),
  HIGGSFIELD_API_KEY_SECRET: z.string().optional(),
  HIGGSFIELD_IMAGE_ENDPOINT: z.string().optional(),
  HIGGSFIELD_VIDEO_ENDPOINT: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  // Voz padrão quando a disciplina não tem voz escolhida no admin.
  ELEVENLABS_VOICE_ID: z.string().optional(),
  // Cota diária de créditos da Higgsfield (o admin pode mudar sem deploy).
  PRODUCTION_DAILY_CREDITS: z.coerce.number().int().positive().default(300),
  PRODUCTION_MEDIA_POLL_MS: z.coerce.number().int().min(200).default(20_000),
  // Vetores da busca por conceito (ADR 0014): Voyage AI. Sem chave, a busca por palavra segue.
  VOYAGE_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('voyage-4'),
  // Avisos por e-mail (SPEC v2, LEM-11). Sem chave, só registro (e arquivo nos testes).
  APP_URL: z.string().url().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Cognuss <nao-responda@gutta.tudomudou.com.br>'),
  MAIL_OUTBOX_FILE: z.string().optional(),
  WORKER_NOTIFY_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
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
  if (parsed.data.NODE_ENV === 'production' && parsed.data.AI_PROVIDER === 'fake') {
    throw new Error('Configuração inválida do worker: AI_PROVIDER=fake não vale em produção');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.MEDIA_PROVIDER === 'fake') {
    throw new Error('Configuração inválida do worker: MEDIA_PROVIDER=fake não vale em produção');
  }
  return parsed.data;
}
