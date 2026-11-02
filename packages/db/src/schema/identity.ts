import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appRole, createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { courses, disciplines, institutions } from './catalog';

const userRef = (name: string) =>
  text(name)
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const profiles = pgTable('profiles', {
  userId: userRef('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roleAssignments = pgTable(
  'role_assignments',
  {
    userId: userRef('user_id'),
    role: appRole('role').notNull(),
    grantedBy: text('granted_by').references(() => authUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    userId: userRef('user_id').primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    institutionId: uuid('institution_id').references(() => institutions.id),
    // "Não encontrei minha instituição": texto livre, moderado depois.
    institutionOther: text('institution_other'),
    semester: smallint('semester').notNull(),
    studyGoalMinutes: smallint('study_goal_minutes').notNull().default(20),
    // 0 = domingo … 6 = sábado
    studyDays: smallint('study_days')
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'::smallint[]`),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('student_profiles_semester_chk', sql`${t.semester} between 1 and 16`),
    check('student_profiles_goal_chk', sql`${t.studyGoalMinutes} between 5 and 240`),
  ],
);

// Histórico não se apaga: trocar de disciplina fecha o vínculo (active_until).
export const studentDisciplines = pgTable(
  'student_disciplines',
  {
    id: pk(),
    studentId: userRef('student_id'),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    activeSince: timestamp('active_since', { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp('active_until', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('student_disciplines_active_uq')
      .on(t.studentId, t.disciplineId)
      .where(sql`${t.activeUntil} is null`),
    index('student_disciplines_student_idx').on(t.studentId),
  ],
);

export const examDates = pgTable(
  'exam_dates',
  {
    id: pk(),
    studentId: userRef('student_id'),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    title: text('title').notNull(),
    examAt: timestamp('exam_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('exam_dates_student_idx').on(t.studentId, t.examAt)],
);

export const consentPurpose = pgEnum('consent_purpose', [
  'terms',
  'privacy',
  'learning_analytics',
  'marketing',
]);

// Registro imutável: cada mudança de consentimento é uma linha nova.
export const consentRecords = pgTable(
  'consent_records',
  {
    id: pk(),
    userId: userRef('user_id'),
    purpose: consentPurpose('purpose').notNull(),
    granted: boolean('granted').notNull(),
    policyVersion: text('policy_version').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('consent_records_user_idx').on(t.userId, t.purpose, t.recordedAt)],
);

export const dataRequests = pgTable(
  'data_requests',
  {
    id: pk(),
    userId: userRef('user_id'),
    kind: text('kind', { enum: ['export', 'deletion'] }).notNull(),
    status: text('status', { enum: ['open', 'done', 'cancelled'] })
      .notNull()
      .default('open'),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('data_requests_user_idx').on(t.userId)],
);
