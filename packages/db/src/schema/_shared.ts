import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

// Timestamps sempre em UTC (timestamptz). A apresentação usa o fuso do aluno.
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const pk = () => uuid('id').primaryKey().defaultRandom();

export const appRole = pgEnum('app_role', [
  'student',
  'editor',
  'reviewer',
  'admin',
  'moderator',
  'support',
]);

// Workflow editorial da SPEC (ADM-01).
export const contentStatus = pgEnum('content_status', [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
]);
