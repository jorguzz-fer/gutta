import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from './_shared';
import { authUsers } from './auth';
import { courses, disciplines } from './catalog';

/*
  Turmas do painel do professor (roadmap F2). O professor cria a turma e passa o código; o
  aluno entra sabendo que o professor verá o desempenho dele. O professor só lê agregados
  por funções do banco (class_*), nunca as tabelas de tentativas direto, e só do que o aluno
  fez depois de entrar na turma.
*/
export const classes = pgTable(
  'classes',
  {
    id: pk(),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    courseId: uuid('course_id').references(() => courses.id),
    disciplineId: uuid('discipline_id').references(() => disciplines.id),
    joinCode: text('join_code').notNull().unique(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('classes_teacher_idx').on(t.teacherId)],
);

export const classMembers = pgTable(
  'class_members',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.studentId] }),
    index('class_members_student_idx').on(t.studentId),
    index('class_members_active_idx')
      .on(t.classId)
      .where(sql`${t.leftAt} is null`),
  ],
);
