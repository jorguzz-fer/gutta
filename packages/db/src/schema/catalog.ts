import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { contentStatus, createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';

export const institutionStatus = pgEnum('institution_status', ['active', 'pending', 'rejected']);

export const institutions = pgTable(
  'institutions',
  {
    id: pk(),
    name: text('name').notNull(),
    state: text('state'),
    city: text('city'),
    status: institutionStatus('status').notNull().default('pending'),
    isDemo: boolean('is_demo').notNull().default(false),
    suggestedBy: text('suggested_by').references(() => authUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('institutions_name_uq').on(sql`lower(${t.name})`)],
);

export const courses = pgTable('courses', {
  id: pk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  active: boolean('active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

export const disciplines = pgTable(
  'disciplines',
  {
    id: pk(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    periodHint: smallint('period_hint'),
    active: boolean('active').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('disciplines_course_slug_uq').on(t.courseId, t.slug)],
);

export const topics = pgTable(
  'topics',
  {
    id: pk(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => topics.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('topics_discipline_slug_uq').on(t.disciplineId, t.slug),
    index('topics_parent_idx').on(t.parentId),
  ],
);

// Módulo padrão do roadmap: aula interativa + resumo + questões e flashcards do assunto.
export const modules = pgTable(
  'modules',
  {
    id: pk(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    lead: text('lead'),
    summaryMd: text('summary_md'),
    lessonUrl: text('lesson_url'),
    estMinutes: smallint('est_minutes'),
    orderIndex: integer('order_index').notNull().default(0),
    status: contentStatus('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    isDemo: boolean('is_demo').notNull().default(false),
    authorId: text('author_id').references(() => authUsers.id, { onDelete: 'set null' }),
    reviewerId: text('reviewer_id').references(() => authUsers.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('modules_discipline_slug_uq').on(t.disciplineId, t.slug),
    index('modules_status_idx').on(t.status, t.disciplineId),
  ],
);
