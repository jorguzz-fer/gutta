import { sql } from 'drizzle-orm';
import {
  check,
  date,
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
import { assessments, lessons } from './schedule';

// Equilíbrio (SPEC v2, 5.4, 7.5 e 8.3). Tarefas são a demanda; a proposta é o que o motor
// calculou, guardada para ser rastreável e reproduzível; só a sessão confirmada entra na
// agenda (R10). Tudo privado do aluno.

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const taskOrigin = pgEnum('task_origin', [
  'aula',
  'falta',
  'prova',
  'nota',
  'aluno',
  'memory',
]);
// Pendente até o aluno decidir (EQU-14): nada se acumula sozinho na semana seguinte.
export const taskStatus = pgEnum('task_status', ['pendente', 'concluida', 'adiada', 'descartada']);
export const taskDifficulty = pgEnum('task_difficulty', ['facil', 'moderado', 'dificil']);
export const taskImportance = pgEnum('task_importance', ['nenhuma', 'importante', 'alta']);

export const studyTasks = pgTable(
  'study_tasks',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'cascade',
    }),
    topicId: uuid('topic_id').references(() => disciplineTopics.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    estimatedMinutes: smallint('estimated_minutes').notNull(),
    doneMinutes: smallint('done_minutes').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    origin: taskOrigin('origin').notNull().default('aluno'),
    difficulty: taskDifficulty('difficulty'),
    importance: taskImportance('importance'),
    status: taskStatus('status').notNull().default('pendente'),
    // Pedido de outro módulo (EQU-18): o mesmo pedido não vira duas tarefas.
    sourceRef: text('source_ref'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('study_tasks_owner_idx').on(t.ownerId, t.status),
    uniqueIndex('study_tasks_source_uq')
      .on(t.ownerId, t.sourceRef)
      .where(sql`${t.sourceRef} is not null`),
    check('study_tasks_minutes_ck', sql`${t.estimatedMinutes} between 5 and 1200`),
    check('study_tasks_done_ck', sql`${t.doneMinutes} >= 0`),
  ],
);

export const proposalStatus = pgEnum('proposal_status', [
  'proposed',
  'accepted',
  'partly_accepted',
  'rejected',
  'superseded',
]);
export const proposalKind = pgEnum('proposal_kind', ['semana', 'replanejar']);

export const planProposals = pgTable(
  'plan_proposals',
  {
    id: pk(),
    ownerId: ownerRef(),
    weekStart: date('week_start').notNull(),
    kind: proposalKind('kind').notNull().default('semana'),
    status: proposalStatus('status').notNull().default('proposed'),
    algorithmVersion: text('algorithm_version').notNull(),
    variant: smallint('variant').notNull().default(0),
    // Entrada do motor, para reproduzir a proposta (SPEC v2, 7.5).
    inputSnapshot: jsonb('input_snapshot').notNull(),
    unplaced: jsonb('unplaced').$type<unknown[]>().notNull().default([]),
    capacity: jsonb('capacity').$type<Record<string, number>>().notNull().default({}),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('plan_proposals_owner_idx').on(t.ownerId, t.weekStart, t.createdAt)],
);

export const sessionStatus = pgEnum('session_status', [
  'proposed',
  'confirmed',
  'done',
  'partly_done',
  'skipped',
  'rescheduled',
]);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: pk(),
    ownerId: ownerRef(),
    proposalId: uuid('proposal_id').references(() => planProposals.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => studyTasks.id, { onDelete: 'cascade' }),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: sessionStatus('status').notNull().default('proposed'),
    // Motivo em códigos (R11); o texto é montado na interface.
    reasonCodes: text('reason_codes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    part: smallint('part'),
    parts: smallint('parts'),
    doneMinutes: integer('done_minutes'),
    // Motivo opcional do reagendamento (EQU-13).
    rescheduleReason: text('reschedule_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('study_sessions_owner_idx').on(t.ownerId, t.startsAt),
    index('study_sessions_proposal_idx').on(t.proposalId),
    index('study_sessions_task_idx').on(t.taskId),
    check('study_sessions_end_ck', sql`${t.endsAt} > ${t.startsAt}`),
    check('study_sessions_done_ck', sql`${t.doneMinutes} is null or ${t.doneMinutes} >= 0`),
  ],
);
