import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplines, modules, topics } from './catalog';
import { files } from './files';

// Produção de aulas interativas (docs/producao/ESPECIFICACAO.md; ADR 0021). Área só do admin:
// o arquivo do professor vira slides, os pedidos viram tarefas e, nas próximas fases, cada
// tarefa aprovada vira peça (modules) e questões (questions). Tudo com prefixo production_.

export const productionBatchStatus = pgEnum('production_batch_status', [
  'waiting_file', // o arquivo ainda está sendo verificado e convertido
  'extracting', // separando slides, texto, notas e imagens
  'planning', // a IA está planejando as peças
  'ready', // plano pronto para o admin aprovar
  'failed',
  'generating', // peças aprovadas sendo geradas (Fase 2)
  'generated', // geração terminou (com ou sem falhas por tarefa)
]);

export const productionSlideKind = pgEnum('production_slide_kind', [
  'content', // slide da aula (vira contexto e imagem de referência)
  'instruction', // pedido do professor ("no slide anterior, montar um esquema…")
  'reference', // referência bibliográfica
]);

export const productionTaskStatus = pgEnum('production_task_status', [
  'proposed', // detectada ou proposta, esperando o admin
  'approved',
  'discarded',
  'generating', // peça sendo escrita e testada
  'generated', // peça pronta e aprovada no teste de render
  'failed', // a peça não passou no linter ou no teste depois das tentativas
]);

export const productionAssetKind = pgEnum('production_asset_kind', [
  'html', // versão da peça (blocos em JSON no armazenamento)
  'screenshot', // captura do teste de render
  'image',
  'clip',
  'audio',
  'video',
]);

export const productionBatches = pgTable(
  'production_batches',
  {
    id: pk(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    /** "Aula 1 · Introdução à fisiologia endócrina". */
    title: text('title').notNull(),
    /** Posição da aula na ordem do curso (vira modules.order_index na publicação). */
    position: integer('position').notNull().default(0),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    createdBy: text('created_by').references(() => authUsers.id, { onDelete: 'set null' }),
    status: productionBatchStatus('status').notNull().default('waiting_file'),
    /** "instructions": a aula traz pedidos; "content": a IA propôs as peças pelo conteúdo. */
    mode: text('mode'),
    bibliography: text('bibliography'),
    error: text('error'),
    /** Avisos da extração e do plano para o admin (slides sem imagem, plano incompleto…). */
    warnings: text('warnings').array().notNull().default([]),
    /** Créditos de mídia: estimado pelas tarefas aprovadas; real a partir da Fase 3. */
    estimatedCredits: integer('estimated_credits').notNull().default(0),
    actualCredits: integer('actual_credits').notNull().default(0),
    /** Custo do plano por IA, em milionésimos de dólar (o mesmo de ai_usage). */
    planCostMicros: bigint('plan_cost_micros', { mode: 'number' }).notNull().default(0),
    planModel: text('plan_model'),
    plannedAt: timestamp('planned_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('production_batches_created_idx').on(t.createdAt),
    index('production_batches_file_idx').on(t.fileId),
  ],
);

export const productionSlides = pgTable(
  'production_slides',
  {
    id: pk(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => productionBatches.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    kind: productionSlideKind('kind').notNull(),
    text: text('text').notNull().default(''),
    notes: text('notes'),
    /** Slide oculto na apresentação: não sai no PDF nem tem imagem. */
    hidden: boolean('hidden').notNull().default(false),
    hasImage: boolean('has_image').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('production_slides_batch_number_uq').on(t.batchId, t.number)],
);

export const productionTasks = pgTable(
  'production_tasks',
  {
    id: pk(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => productionBatches.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** "instruction": pedido do professor; "proposed": proposta da IA numa aula sem pedidos. */
    origin: text('origin').notNull(),
    sourceSlides: integer('source_slides').array().notNull(),
    targetSlides: integer('target_slides').array().notNull(),
    targetAssumed: boolean('target_assumed').notNull().default(false),
    /** Texto do pedido como o professor escreveu, ou o motivo da proposta da IA. */
    instruction: text('instruction').notNull(),
    priority: boolean('priority').notNull().default(false),
    /** Um dos tipos de PIECE_TYPES (@gutta/core). */
    pieceType: text('piece_type'),
    title: text('title').notNull(),
    /** Plano da peça (formato ProductionPiecePlan de @gutta/ai), editável pelo admin. */
    plan: jsonb('plan').$type<Record<string, unknown>>(),
    status: productionTaskStatus('status').notNull().default('proposed'),
    /** Peça publicada (Fase 4). */
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    /** Última versão da peça gerada (production_assets, tipo html). */
    currentVersion: integer('current_version'),
    /** Por que a última geração falhou (linter ou teste de render), para o admin. */
    lastError: text('last_error'),
    /** Pedido de ajuste para a próxima geração (admin ou, na Fase 4, o revisor). */
    pendingNote: text('pending_note'),
    /**
     * Etapa da mídia de um vídeo (Fase 3): storyboard, storyboard_review, images, images_review,
     * clips, narration, assembling, paused, done. Null nas peças sem mídia.
     */
    mediaStage: text('media_stage'),
    /** Roteiro do vídeo (Storyboard de @gutta/core), editável pelo admin antes da mídia. */
    storyboard: jsonb('storyboard').$type<Record<string, unknown>>(),
    /** Aviso da mídia para o admin: cota do dia, fila cheia, saldo, moderação. */
    mediaAlert: text('media_alert'),
    /** Etapa a retomar quando a mídia estiver pausada. */
    mediaResume: text('media_resume'),
    /** Um trabalho de mídia por vez em cada tarefa: quem pega a vez marca até quando. */
    mediaLeaseUntil: timestamp('media_lease_until', { withTimezone: true }),
    /** Questões do plano enviadas à revisão junto com a peça (Fase 4). */
    questionIds: uuid('question_ids').array().notNull().default([]),
    /** Versão da peça que o revisor aprovou: é a que o aluno vê depois de publicada. */
    approvedVersion: integer('approved_version'),
    /** Ajuste pedido na revisão: ao terminar de gerar, a peça volta sozinha para a fila. */
    backToReview: boolean('back_to_review').notNull().default(false),
    decidedBy: text('decided_by').references(() => authUsers.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('production_tasks_batch_position_uq').on(t.batchId, t.position)],
);

export const productionAssets = pgTable(
  'production_assets',
  {
    id: pk(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => productionBatches.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => productionTasks.id, { onDelete: 'cascade' }),
    kind: productionAssetKind('kind').notNull(),
    /** Versão da peça a que o arquivo pertence. */
    version: integer('version').notNull(),
    /** claude, fake, playwright, higgsfield, elevenlabs, ffmpeg. */
    provider: text('provider').notNull(),
    /** Trabalho no provedor, para nunca repetir uma geração paga sem conferir a anterior. */
    externalJobId: text('external_job_id'),
    storageKey: text('storage_key'),
    /** Detalhes: linter, teste de render, tema da captura, prompt da mídia. */
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    credits: integer('credits').notNull().default(0),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('production_assets_task_idx').on(t.taskId, t.kind, t.version)],
);

/** Decisões e comentários do revisor sobre uma peça (docs/producao, telas do admin, item 4). */
export const productionReviews = pgTable(
  'production_reviews',
  {
    id: pk(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => productionBatches.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => productionTasks.id, { onDelete: 'cascade' }),
    /** Versão da peça revisada. */
    version: integer('version').notNull(),
    reviewerId: text('reviewer_id').references(() => authUsers.id, { onDelete: 'set null' }),
    /** approved: aprovou; changes: pediu ajuste (a peça é gerada de novo com o comentário). */
    decision: text('decision').notNull(),
    /** Trecho comentado ("Cenário 2", "Questão 1", "Narração da cena 3"), ou null para a peça toda. */
    excerpt: text('excerpt'),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [index('production_reviews_task_idx').on(t.taskId, t.createdAt)],
);
