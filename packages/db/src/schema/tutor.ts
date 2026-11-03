import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk } from './_shared';
import { authUsers } from './auth';
import { modules } from './catalog';

/*
  Tutor IA (SPEC M3, roadmap F1). Cada conversa é de um aluno e de um módulo; cada mensagem
  guarda modelo, tokens e custo, para a cota diária e o painel de custo do admin. As conversas
  ficam guardadas (o aluno é avisado na tela) e o admin pode revisá-las.
*/
export const tutorRole = pgEnum('tutor_role', ['user', 'assistant']);

export const tutorConversations = pgTable(
  'tutor_conversations',
  {
    id: pk(),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('tutor_conversations_student_idx').on(t.studentId, t.moduleId)],
);

export const tutorMessages = pgTable(
  'tutor_messages',
  {
    id: pk(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => tutorConversations.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: tutorRole('role').notNull(),
    content: text('content').notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    /** Custo estimado em milionésimos de dólar (inteiro, sem erro de arredondamento). */
    costMicros: integer('cost_micros').notNull().default(0),
    stopReason: text('stop_reason'),
    refused: boolean('refused').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('tutor_messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('tutor_messages_student_day_idx').on(t.studentId, t.createdAt),
  ],
);

// Configurações da operação que o admin muda sem deploy (ex.: ligar e desligar o tutor).
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: text('updated_by').references(() => authUsers.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
