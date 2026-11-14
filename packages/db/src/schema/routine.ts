import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { enrolledDisciplines } from './academic';

// Rotina semanal (SPEC v2, 5.3 e 8.2). Blocos que se repetem nos dias da semana escolhidos
// (ROT-04). Só "estudo" é horário autorizado para o planejamento (ROT-08); aula e pessoal são
// protegidos (ROT-05, ROT-06). Horários em minutos do dia, no fuso do aluno.

export const routineBlockKind = pgEnum('routine_block_kind', ['aula', 'estudo', 'pessoal']);

export const routineBlocks = pgTable(
  'routine_blocks',
  {
    id: pk(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    kind: routineBlockKind('kind').notNull(),
    // Pessoal: sono, refeicao, lazer, academia, esporte, idiomas, trabalho, descanso,
    // bloqueado (sem motivo, ROT-07) ou personalizada.
    category: text('category'),
    label: text('label').notNull(),
    // Aula montada à mão na grade (DIS-09, ROT-02).
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'cascade',
    }),
    color: smallint('color'),
    weekdays: smallint('weekdays').array().notNull(),
    startMinute: smallint('start_minute').notNull(),
    // Até 24 h; passa da meia-noite quando start + duração > 1440 (sono das 23:00 às 07:00).
    durationMinutes: smallint('duration_minutes').notNull(),
    validFrom: date('valid_from').notNull().defaultNow(),
    validUntil: date('valid_until'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('routine_blocks_owner_idx').on(t.ownerId),
    check('routine_blocks_start_ck', sql`${t.startMinute} between 0 and 1439`),
    check('routine_blocks_duration_ck', sql`${t.durationMinutes} between 5 and 1440`),
    check(
      'routine_blocks_weekdays_ck',
      sql`cardinality(${t.weekdays}) between 1 and 7 and ${t.weekdays} <@ array[0,1,2,3,4,5,6]::smallint[]`,
    ),
    check('routine_blocks_color_ck', sql`${t.color} is null or ${t.color} between 1 and 8`),
    check('routine_blocks_aula_ck', sql`(${t.kind} = 'aula') = (${t.disciplineId} is not null)`),
    check(
      'routine_blocks_valid_ck',
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`,
    ),
  ],
);

export const preferredPeriod = pgEnum('preferred_period', ['manha', 'tarde', 'noite', 'varia']);
export const planIntensity = pgEnum('plan_intensity', ['leve', 'equilibrada', 'intensiva']);
export const planPriority = pgEnum('plan_priority', [
  'bem_estar',
  'avaliacoes',
  'dificuldade',
  'distribuicao',
]);

// Preferências de planejamento (SPEC v2, 8.3): a meta semanal (ROT-09), a grade (ROT-01) e as
// do Equilíbrio (EQU-01 a EQU-03), com os padrões da SPEC e da seção 6.4 (D15).
export const planningPreferences = pgTable(
  'planning_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    // Sugestão inicial de 20 horas (ROT-09). Não é exigência.
    weeklyGoalMinutes: integer('weekly_goal_minutes').notNull().default(1200),
    gridStepMinutes: smallint('grid_step_minutes').notNull().default(60),
    viewStartMinute: smallint('view_start_minute').notNull().default(480),
    viewEndMinute: smallint('view_end_minute').notNull().default(1440),
    // Passo "Minha rotina" do cadastro concluído (CAD-05).
    routineConfirmedAt: timestamp('routine_confirmed_at', { withTimezone: true }),
    // Equilíbrio (EQU-01 a EQU-03). Padrão: varia, 30 min, equilibrada, bem-estar.
    preferredPeriod: preferredPeriod('preferred_period').notNull().default('varia'),
    sessionMinutes: smallint('session_minutes').notNull().default(30),
    intensity: planIntensity('intensity').notNull().default('equilibrada'),
    priority: planPriority('priority').notNull().default('bem_estar'),
    dailyLimitMinutes: smallint('daily_limit_minutes'),
    weeklyLimitMinutes: smallint('weekly_limit_minutes'),
    breakMinutes: smallint('break_minutes').notNull().default(10),
    maxConsecutive: smallint('max_consecutive').notNull().default(2),
    longBreakMinutes: smallint('long_break_minutes').notNull().default(30),
    avoidAfterLongJourney: boolean('avoid_after_long_journey').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('planning_goal_ck', sql`${t.weeklyGoalMinutes} between 0 and 6000`),
    check('planning_step_ck', sql`${t.gridStepMinutes} in (15, 30, 60)`),
    check('planning_session_ck', sql`${t.sessionMinutes} in (20, 30, 45, 60)`),
    check('planning_break_ck', sql`${t.breakMinutes} between 5 and 30`),
    check('planning_consecutive_ck', sql`${t.maxConsecutive} between 1 and 4`),
    check('planning_long_break_ck', sql`${t.longBreakMinutes} between 10 and 120`),
    check(
      'planning_limits_ck',
      sql`(${t.dailyLimitMinutes} is null or ${t.dailyLimitMinutes} between 0 and 1440)
        and (${t.weeklyLimitMinutes} is null or ${t.weeklyLimitMinutes} between 0 and 6000)`,
    ),
    check(
      'planning_view_ck',
      sql`${t.viewStartMinute} between 0 and 1380 and ${t.viewEndMinute} between 60 and 1440 and ${t.viewEndMinute} > ${t.viewStartMinute}`,
    ),
  ],
);
