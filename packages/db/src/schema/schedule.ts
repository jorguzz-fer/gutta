import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplineTeachers, disciplineTopics, enrolledDisciplines } from './academic';
import { files } from './files';

// Cronograma e avaliações (SPEC v2, 8.2 e 8.6). Cada fato tem uma tabela dona, e a agenda lê
// todas (SPEC v2, 7.6). Nada vem do cronograma sem a confirmação do aluno (DIS-05).

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const lessonKind = pgEnum('lesson_kind', ['aula', 'pratica', 'outro']);
export const assessmentKind = pgEnum('assessment_kind', ['prova', 'atividade', 'entrega']);
export const eventOrigin = pgEnum('event_origin', ['imported', 'manual']);

export const lessons = pgTable(
  'lessons',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    kind: lessonKind('kind').notNull().default('aula'),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // Sem hora no cronograma: vale o dia inteiro (starts_at é a meia-noite local).
    allDay: boolean('all_day').notNull().default(false),
    topicId: uuid('topic_id').references(() => disciplineTopics.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => disciplineTeachers.id, { onDelete: 'set null' }),
    location: text('location'),
    classHours: numeric('class_hours', { precision: 4, scale: 1 }),
    origin: eventOrigin('origin').notNull().default('manual'),
    // Como veio do cronograma, para mostrar o que o aluno mudou (CAL-06).
    original: jsonb('original').$type<Record<string, unknown>>(),
    modifiedByStudent: boolean('modified_by_student').notNull().default(false),
    importId: uuid('import_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('lessons_owner_starts_idx').on(t.ownerId, t.startsAt),
    index('lessons_discipline_idx').on(t.disciplineId, t.startsAt),
    check('lessons_end_ck', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);

export const assessments = pgTable(
  'assessments',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    kind: assessmentKind('kind').notNull(),
    name: text('name').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    allDay: boolean('all_day').notNull().default(false),
    // Peso, porcentagem e nota entram com o módulo de notas (NOT); a nota nula é pendente.
    weight: numeric('weight', { precision: 6, scale: 2 }),
    percent: numeric('percent', { precision: 5, scale: 2 }),
    maxGrade: numeric('max_grade', { precision: 6, scale: 2 }).notNull().default('10'),
    grade: numeric('grade', { precision: 6, scale: 2 }),
    topicNote: text('topic_note'),
    origin: eventOrigin('origin').notNull().default('manual'),
    original: jsonb('original').$type<Record<string, unknown>>(),
    modifiedByStudent: boolean('modified_by_student').notNull().default(false),
    importId: uuid('import_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('assessments_owner_due_idx').on(t.ownerId, t.dueAt),
    index('assessments_discipline_idx').on(t.disciplineId),
  ],
);

export const scheduleImportStatus = pgEnum('schedule_import_status', [
  'waiting_file', // o arquivo ainda está sendo processado
  'needs_consent', // o aluno não autorizou a leitura por IA
  'extracting',
  'ready', // pronto para conferir
  'confirmed',
  'rejected',
  'failed',
]);

export const scheduleImports = pgTable(
  'schedule_imports',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    status: scheduleImportStatus('status').notNull().default('waiting_file'),
    // O que a IA leu (formato de @gutta/ai), e o que o aluno confirmou.
    extracted: jsonb('extracted').$type<Record<string, unknown>>(),
    confirmed: jsonb('confirmed').$type<Record<string, unknown>>(),
    referenceYear: smallint('reference_year').notNull(),
    error: text('error'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('schedule_imports_owner_idx').on(t.ownerId, t.disciplineId, t.createdAt)],
);

// Uso de IA por aluno e por recurso (SPEC v2, 7.7; decisão D07: sem teto no QA, mas medido).
// Só inserção. O tutor do MVP continua registrando em tutor_messages.
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ownerId: text('owner_id').references(() => authUsers.id, { onDelete: 'set null' }),
    feature: text('feature').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    costMicros: integer('cost_micros').notNull().default(0),
    refused: boolean('refused').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_usage_owner_idx').on(t.ownerId, t.createdAt),
    index('ai_usage_feature_idx').on(t.feature, t.createdAt),
  ],
);

// Alerta de gasto com IA (SPEC v2, 7.7): um por mês, quando o gasto do mês passa do valor
// configurado pelo admin. Não bloqueia aluno; serve para um defeito não gastar sem ninguém ver.
// Gravado só pelo worker, por função de sistema.
export const aiSpendAlerts = pgTable('ai_spend_alerts', {
  period: text('period').primaryKey(),
  totalMicros: bigint('total_micros', { mode: 'number' }).notNull(),
  thresholdMicros: bigint('threshold_micros', { mode: 'number' }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

// Compromissos do aluno no calendário (SPEC v2, CAL-02 a CAL-05; 8.2). Série em horário local
// (data, minuto do dia e duração) com regra de @gutta/core/recurrence; cada ocorrência mudada
// fica em calendar_event_exceptions (só esta). Aula e avaliação não ficam aqui: têm tabela
// própria, e a agenda lê todas (CAL-16).
export const calendarEventKind = pgEnum('calendar_event_kind', [
  'compromisso',
  'estudo',
  'revisao',
  'lazer',
  'descanso',
  'outro',
]);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'cascade',
    }),
    kind: calendarEventKind('kind').notNull().default('compromisso'),
    title: text('title').notNull(),
    notes: text('notes'),
    color: smallint('color'),
    startDate: date('start_date').notNull(),
    // Null: dia inteiro.
    startMinute: smallint('start_minute'),
    durationMinutes: smallint('duration_minutes').notNull().default(60),
    // Regra de recorrência (RecurrenceRule do core); null = evento único.
    recurrence: jsonb('recurrence').$type<Record<string, unknown>>(),
    // Lembrete "apenas lembrar" não ocupa horário (LEM-08).
    blocksTime: boolean('blocks_time').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('calendar_events_owner_idx').on(t.ownerId, t.startDate),
    check(
      'calendar_events_start_ck',
      sql`${t.startMinute} is null or ${t.startMinute} between 0 and 1439`,
    ),
    check('calendar_events_duration_ck', sql`${t.durationMinutes} between 5 and 1440`),
    check('calendar_events_color_ck', sql`${t.color} is null or ${t.color} between 1 and 8`),
  ],
);

export const calendarEventExceptions = pgTable(
  'calendar_event_exceptions',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    ownerId: ownerRef(),
    // Data original da ocorrência.
    occurrenceDate: date('occurrence_date').notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    // { date?, start?, durationMinutes?, title? } (OccurrenceChange do core).
    change: jsonb('change').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.occurrenceDate] })],
);
