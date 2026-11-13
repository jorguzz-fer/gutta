import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { enrolledDisciplines } from './academic';
import { lessons } from './schedule';

// Faltas (SPEC v2, 5.12 e 8.6). Controle pessoal, em horas-aula. Não substitui o registro da
// instituição (FAL-13). O limite é configurável; nada é aplicado sozinho (FAL-04).

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const attendanceRules = pgTable(
  'attendance_rules',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    totalClassHours: numeric('total_class_hours', { precision: 6, scale: 1 }).notNull(),
    // Frequência mínima exigida; o limite de faltas é o resto (75% → 25% de faltas).
    minAttendancePct: numeric('min_attendance_pct', { precision: 5, scale: 2 }).notNull(),
    classHoursPerMeeting: numeric('class_hours_per_meeting', { precision: 4, scale: 1 })
      .notNull()
      .default('2'),
    // Dias de aula quando não há cronograma (0 = domingo).
    weekdays: smallint('weekdays').array(),
    // Avisos ao chegar nesses percentuais do limite (FAL-07).
    alertThresholds: smallint('alert_thresholds')
      .array()
      .notNull()
      .default(sql`'{50,75,90}'::smallint[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('attendance_rules_discipline_uq').on(t.disciplineId),
    check('attendance_total_ck', sql`${t.totalClassHours} > 0`),
    check('attendance_min_ck', sql`${t.minAttendancePct} between 0 and 100`),
    check('attendance_meeting_ck', sql`${t.classHoursPerMeeting} > 0`),
  ],
);

export const absences = pgTable(
  'absences',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    // A aula do cronograma, quando houver. Se a aula sair, o registro fica (FAL-12).
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    // Dia local da aula.
    date: date('date').notNull(),
    classHours: numeric('class_hours', { precision: 4, scale: 1 }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('absences_discipline_idx').on(t.disciplineId, t.date),
    // Um registro por aula (FAL-09): pela aula do cronograma ou, sem ela, pelo dia.
    uniqueIndex('absences_one_per_lesson_uq')
      .on(t.disciplineId, t.lessonId)
      .where(sql`${t.lessonId} is not null`),
    uniqueIndex('absences_one_per_day_uq')
      .on(t.disciplineId, t.date)
      .where(sql`${t.lessonId} is null`),
    check('absences_hours_ck', sql`${t.classHours} > 0`),
  ],
);
