import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { enrolledDisciplines } from './academic';
import { calendarEvents } from './schedule';

// Lembretes e avisos (SPEC v2, 5.11 e 8.2). Um mecanismo só: lembrete do aluno e alerta
// acadêmico viram linhas de `notifications`, cada uma com uma chave por origem, então o mesmo
// compromisso nunca gera dois avisos (LEM-13). A plataforma mostra o que já venceu; o worker
// manda por e-mail quando o aluno escolheu, fora do horário silencioso e dentro do teto.

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const reminderMode = pgEnum('reminder_mode', ['lembrar', 'reservar']);

export const reminders = pgTable(
  'reminders',
  {
    id: pk(),
    ownerId: ownerRef(),
    title: text('title').notNull(),
    description: text('description'),
    // Tarefa, leitura, trabalho, reunião, prazo, outro (LEM-01).
    category: text('category').notNull().default('tarefa'),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'set null',
    }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    // "Apenas lembrar" não ocupa horário; "reservar" cria o compromisso (LEM-08).
    mode: reminderMode('mode').notNull().default('lembrar'),
    durationMinutes: smallint('duration_minutes'),
    calendarEventId: uuid('calendar_event_id').references(() => calendarEvents.id, {
      onDelete: 'set null',
    }),
    // Antecedência do aviso (LEM-10); null: sem aviso.
    leadMinutes: integer('lead_minutes').default(30),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reminders_owner_due_idx').on(t.ownerId, t.dueAt),
    check(
      'reminders_lead_ck',
      sql`${t.leadMinutes} is null or ${t.leadMinutes} between 0 and 20160`,
    ),
    check(
      'reminders_duration_ck',
      sql`${t.durationMinutes} is null or ${t.durationMinutes} between 5 and 1440`,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    ownerId: ownerRef(),
    // Origem do aviso: "reminder:{id}", "assessment:{id}:{instante}", "import:{id}"...
    dedupeKey: text('dedupe_key').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    // Tratado pelo envio por e-mail (enviado, pulado ou fora de prazo).
    emailHandledAt: timestamp('email_handled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notifications_owner_dedupe_uq').on(t.ownerId, t.dedupeKey),
    index('notifications_owner_scheduled_idx').on(t.ownerId, t.scheduledFor),
    index('notifications_email_pending_idx')
      .on(t.scheduledFor)
      .where(sql`${t.emailHandledAt} is null`),
  ],
);

export const deliveryStatus = pgEnum('delivery_status', ['sent', 'skipped', 'failed']);

// Só inserção: registro de cada tentativa de entrega fora da plataforma.
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    ownerId: ownerRef(),
    channel: text('channel').notNull(),
    status: deliveryStatus('status').notNull(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('notification_deliveries_owner_idx').on(t.ownerId, t.createdAt)],
);

// Preferências de aviso (LEM-11, LEM-12, LEM-14). Uma linha por aluno; sem linha, os padrões.
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    // E-mail só quando o aluno liga.
    emailEnabled: boolean('email_enabled').notNull().default(false),
    // Horário silencioso em minutos do dia local; os dois nulos: desligado.
    quietFrom: smallint('quiet_from'),
    quietUntil: smallint('quiet_until'),
    dailyCap: smallint('daily_cap').notNull().default(10),
    academicAlerts: boolean('academic_alerts').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'notification_quiet_ck',
      sql`(${t.quietFrom} is null) = (${t.quietUntil} is null) and (${t.quietFrom} is null or (${t.quietFrom} between 0 and 1439 and ${t.quietUntil} between 0 and 1439))`,
    ),
    check('notification_cap_ck', sql`${t.dailyCap} between 1 and 50`),
  ],
);
