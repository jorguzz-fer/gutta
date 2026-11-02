import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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
import { topics } from './catalog';
import { questions } from './learning';

// Flashcards (FC-01). owner_id nulo = editorial (passa pelo workflow); preenchido = pessoal, privado.
export const flashcardVisibility = pgEnum('flashcard_visibility', ['private', 'editorial']);

export const flashcards = pgTable(
  'flashcards',
  {
    id: pk(),
    ownerId: text('owner_id').references(() => authUsers.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id),
    front: text('front').notNull(),
    back: text('back').notNull(),
    sourceQuestionId: uuid('source_question_id').references(() => questions.id, {
      onDelete: 'set null',
    }),
    visibility: flashcardVisibility('visibility').notNull().default('private'),
    status: contentStatus('status').notNull().default('published'),
    isDemo: boolean('is_demo').notNull().default(false),
    authorId: text('author_id').references(() => authUsers.id, { onDelete: 'set null' }),
    reviewerId: text('reviewer_id').references(() => authUsers.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'flashcards_visibility_chk',
      sql`(${t.visibility} = 'private' and ${t.ownerId} is not null) or (${t.visibility} = 'editorial' and ${t.ownerId} is null)`,
    ),
    uniqueIndex('flashcards_owner_question_uq').on(t.ownerId, t.sourceQuestionId),
    index('flashcards_topic_idx').on(t.topicId, t.status),
    index('flashcards_owner_idx').on(t.ownerId),
  ],
);

export const flashcardSchedules = pgTable(
  'flashcard_schedules',
  {
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    flashcardId: uuid('flashcard_id')
      .notNull()
      .references(() => flashcards.id, { onDelete: 'cascade' }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    intervalDays: integer('interval_days').notNull().default(0),
    ease: real('ease').notNull().default(2.5),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    algorithmVersion: text('algorithm_version').notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.flashcardId] }),
    index('flashcard_schedules_due_idx').on(t.studentId, t.dueAt),
  ],
);

// Histórico imutável de revisões.
export const flashcardReviews = pgTable(
  'flashcard_reviews',
  {
    id: pk(),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    flashcardId: uuid('flashcard_id')
      .notNull()
      .references(() => flashcards.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    prevIntervalDays: integer('prev_interval_days').notNull(),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull(),
    clientReviewKey: text('client_review_key').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('flashcard_reviews_rating_chk', sql`${t.rating} between 0 and 3`),
    uniqueIndex('flashcard_reviews_idem_uq').on(t.studentId, t.clientReviewKey),
    index('flashcard_reviews_student_idx').on(t.studentId, t.reviewedAt),
  ],
);
