import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contentStatus, createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplines, topics } from './catalog';

// ── Banco de questões (QUE-01) ───────────────────────────────────────────
// Cada versão é uma linha. root_id agrupa as versões; tentativas antigas continuam apontando
// para a versão que o aluno respondeu (SPEC ADM-01).
export const questions = pgTable(
  'questions',
  {
    id: pk(),
    rootId: uuid('root_id'),
    version: integer('version').notNull().default(1),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    stem: text('stem').notNull(),
    difficulty: smallint('difficulty').notNull().default(2),
    status: contentStatus('status').notNull().default('draft'),
    isDemo: boolean('is_demo').notNull().default(false),
    reviewNotes: text('review_notes'),
    authorId: text('author_id').references(() => authUsers.id, { onDelete: 'set null' }),
    reviewerId: text('reviewer_id').references(() => authUsers.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('questions_difficulty_chk', sql`${t.difficulty} between 1 and 5`),
    index('questions_study_idx').on(t.status, t.topicId, t.difficulty),
    index('questions_discipline_idx').on(t.disciplineId, t.status),
    index('questions_root_idx').on(t.rootId),
  ],
);

export const questionOptions = pgTable(
  'question_options',
  {
    id: pk(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    displayOrder: smallint('display_order').notNull(),
    body: text('body').notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    explanation: text('explanation').notNull().default(''),
  },
  (t) => [
    uniqueIndex('question_options_order_uq').on(t.questionId, t.displayOrder),
    // Exatamente uma correta é checado no envio para revisão; aqui garantimos no máximo uma.
    uniqueIndex('question_options_one_correct_uq')
      .on(t.questionId)
      .where(sql`${t.isCorrect}`),
  ],
);

export const questionSources = pgTable(
  'question_sources',
  {
    id: pk(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    citation: text('citation').notNull(),
    url: text('url'),
    accessedAt: timestamp('accessed_at', { withTimezone: true }),
  },
  (t) => [index('question_sources_question_idx').on(t.questionId)],
);

// ── Estudo do aluno ──────────────────────────────────────────────────────
export const sessionMode = pgEnum('question_session_mode', ['practice', 'diagnostic', 'daily']);

export const questionSessions = pgTable(
  'question_sessions',
  {
    id: pk(),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    mode: sessionMode('mode').notNull().default('practice'),
    // Recorte pedido: módulo, disciplina ou assuntos. Guardado para refazer a seleção.
    scope: jsonb('scope')
      .$type<{
        moduleId?: string;
        disciplineId?: string;
        topicIds?: string[];
        questionId?: string;
      }>()
      .notNull()
      .default({}),
    targetCount: smallint('target_count').notNull().default(5),
    algorithmVersion: text('algorithm_version').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('question_sessions_student_idx').on(t.studentId, t.startedAt)],
);

export const questionAttempts = pgTable(
  'question_attempts',
  {
    id: pk(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => questionSessions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    selectedOptionId: uuid('selected_option_id')
      .notNull()
      .references(() => questionOptions.id),
    // Calculado no banco por trigger a partir da alternativa: o cliente não define.
    isCorrect: boolean('is_correct').notNull().default(false),
    durationSeconds: integer('duration_seconds'),
    clientAttemptKey: text('client_attempt_key').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('question_attempts_idem_uq').on(t.studentId, t.clientAttemptKey),
    uniqueIndex('question_attempts_once_per_session_uq').on(t.sessionId, t.questionId),
    index('question_attempts_student_idx').on(t.studentId, t.answeredAt),
    index('question_attempts_question_idx').on(t.questionId),
  ],
);

export const masteryConfidence = pgEnum('mastery_confidence', [
  'insufficient',
  'low',
  'medium',
  'high',
]);

// Estimativa de domínio por aluno × assunto (SPEC QUE-02). Não é nota oficial.
export const topicMastery = pgTable(
  'topic_mastery',
  {
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    attemptCount: integer('attempt_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    estimatedMastery: real('estimated_mastery'),
    confidence: masteryConfidence('confidence').notNull().default('insufficient'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    algorithmVersion: text('algorithm_version').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.topicId] })],
);

// Rastreabilidade: o que foi recomendado, por quê e com qual versão do algoritmo.
export const learningRecommendations = pgTable(
  'learning_recommendations',
  {
    id: pk(),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id),
    type: text('type').notNull(),
    reasonCode: text('reason_code').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    algorithmVersion: text('algorithm_version').notNull(),
    createdAt: createdAt(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('learning_recommendations_student_idx').on(t.studentId, t.createdAt)],
);
