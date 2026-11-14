import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplineTopics, enrolledDisciplines } from './academic';
import { materials, materialVersions } from './materials';

// Ajuda Cognuss (SPEC v2, 5.14 e 8.7; ADR 0020). O trabalho de IA tem estado visível; a criação
// guarda o conteúdo e as páginas de origem (IA-2). Tudo privado do aluno.

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const aiJobStatus = pgEnum('ai_job_status', [
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
]);

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id: pk(),
    ownerId: ownerRef(),
    feature: text('feature').notNull(),
    status: aiJobStatus('status').notNull().default('queued'),
    // Só identificadores e escolhas do aluno; o texto dos materiais é lido no worker.
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    resultId: uuid('result_id'),
    error: text('error'),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('ai_jobs_owner_idx').on(t.ownerId, t.createdAt)],
);

export const creationType = pgEnum('creation_type', [
  'resumo',
  'flashcards',
  'questoes',
  'mapa',
  'roteiro',
]);
export const creationLevel = pgEnum('creation_level', ['basico', 'intermediario', 'avancado']);

export const creations = pgTable(
  'creations',
  {
    id: pk(),
    ownerId: ownerRef(),
    jobId: uuid('job_id').references(() => aiJobs.id, { onDelete: 'set null' }),
    type: creationType('type').notNull(),
    level: creationLevel('level').notNull(),
    style: text('style'),
    title: text('title').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'set null',
    }),
    topicId: uuid('topic_id').references(() => disciplineTopics.id, { onDelete: 'set null' }),
    // Material novo no mesmo tema ou disciplina depois da criação (AJU-11).
    stale: boolean('stale').notNull().default(false),
    // Sempre gerado por IA hoje; o selo de IA-8 sai daqui.
    aiGenerated: boolean('ai_generated').notNull().default(true),
    // Editado pelo aluno depois de gerado (IA-6).
    editedAt: timestamp('edited_at', { withTimezone: true }),
    model: text('model'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('creations_owner_idx').on(t.ownerId, t.createdAt),
    index('creations_discipline_idx').on(t.disciplineId),
  ],
);

export const creationSources = pgTable(
  'creation_sources',
  {
    id: pk(),
    ownerId: ownerRef(),
    creationId: uuid('creation_id')
      .notNull()
      .references(() => creations.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id').references(() => materials.id, { onDelete: 'set null' }),
    versionId: uuid('version_id').references(() => materialVersions.id, { onDelete: 'set null' }),
    pages: integer('pages').array().notNull(),
  },
  (t) => [index('creation_sources_creation_idx').on(t.creationId)],
);

export const creationQuestionKind = pgEnum('creation_question_kind', ['objetiva', 'discursiva']);

// Questões geradas (AJU-06, MEM-03): o gabarito e o comentário só saem do servidor depois da
// tentativa (IA-9).
export const creationQuestions = pgTable(
  'creation_questions',
  {
    id: pk(),
    ownerId: ownerRef(),
    creationId: uuid('creation_id')
      .notNull()
      .references(() => creations.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    kind: creationQuestionKind('kind').notNull(),
    stem: text('stem').notNull(),
    options: text('options').array().notNull(),
    correctIndex: smallint('correct_index'),
    expected: text('expected'),
    comment: text('comment').notNull(),
    difficulty: text('difficulty').notNull(),
    refs: text('refs').array().notNull(),
  },
  (t) => [
    uniqueIndex('creation_questions_position_uq').on(t.creationId, t.position),
    check(
      'creation_questions_kind_ck',
      sql`(${t.kind} = 'objetiva' and ${t.correctIndex} is not null and cardinality(${t.options}) >= 2)
        or (${t.kind} = 'discursiva' and ${t.expected} is not null)`,
    ),
  ],
);

export const creationQuestionAttempts = pgTable(
  'creation_question_attempts',
  {
    id: pk(),
    ownerId: ownerRef(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => creationQuestions.id, { onDelete: 'cascade' }),
    chosenIndex: smallint('chosen_index'),
    answerText: text('answer_text'),
    // Objetiva: corrigida no servidor. Discursiva: o aluno compara com a esperada.
    correct: boolean('correct'),
    // Repetição da mesma resposta (chave idempotente do cliente) não conta duas vezes.
    clientKey: text('client_key'),
    createdAt: createdAt(),
  },
  (t) => [
    index('creation_question_attempts_idx').on(t.questionId, t.createdAt),
    uniqueIndex('creation_question_attempts_key_uq')
      .on(t.ownerId, t.clientKey)
      .where(sql`${t.clientKey} is not null`),
  ],
);

export const tutorScope = pgEnum('tutor_scope', ['materiais', 'aula', 'slide']);

// Tutor sobre os materiais do aluno (AJU-08, AUL-17): uma conversa por escopo escolhido. As
// fontes ficam guardadas para a conversa seguir usando as mesmas páginas.
export const tutorThreads = pgTable(
  'tutor_threads',
  {
    id: pk(),
    ownerId: ownerRef(),
    scope: tutorScope('scope').notNull(),
    title: text('title').notNull(),
    materialIds: uuid('material_ids').array().notNull(),
    lessonId: uuid('lesson_id'),
    focusMaterialId: uuid('focus_material_id'),
    focusPage: integer('focus_page'),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tutor_threads_owner_idx').on(t.ownerId, t.updatedAt)],
);

export const tutorThreadMessages = pgTable(
  'tutor_thread_messages',
  {
    id: pk(),
    ownerId: ownerRef(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => tutorThreads.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    // Páginas citadas na resposta (IA-2).
    citations: jsonb('citations').$type<unknown[]>().notNull().default([]),
    model: text('model'),
    refused: boolean('refused').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('tutor_thread_messages_idx').on(t.threadId, t.createdAt),
    check('tutor_thread_messages_role_ck', sql`${t.role} in ('user', 'assistant')`),
  ],
);
