import { bigserial, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
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
