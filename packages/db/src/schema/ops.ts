import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createdAt } from './_shared';

// Trilha de auditoria: só inserção pela aplicação; leitura restrita a admin (RLS).
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

// Eventos de produto (ANA-01). Sem PII nas propriedades.
export const productEvents = pgTable(
  'product_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: text('actor_id'),
    eventName: text('event_name').notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('product_events_name_created_idx').on(t.eventName, t.createdAt),
    index('product_events_actor_created_idx').on(t.actorId, t.createdAt),
  ],
);

// Outbox (ADR 0013): eventos gravados na mesma transação da mudança e publicados na fila
// pelo worker. Só identificadores no payload, nunca conteúdo do aluno. O app só insere;
// leitura e marcação são das funções outbox_pending e outbox_mark_published.
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text('dedupe_key'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('outbox_dedupe_key_uq').on(t.dedupeKey),
    index('outbox_pending_idx')
      .on(t.availableAt)
      .where(sql`${t.publishedAt} is null`),
  ],
);
