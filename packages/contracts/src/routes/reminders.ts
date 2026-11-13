import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Meus lembretes e avisos (SPEC v2, 5.11). Lembrete é do aluno; aviso é o que a plataforma
// mostra (e manda por e-mail, se o aluno quiser) quando chega a hora.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM.');

export const REMINDER_CATEGORIES = [
  'tarefa',
  'leitura',
  'trabalho',
  'reuniao',
  'prazo',
  'outro',
] as const;
export const LEAD_OPTIONS = [0, 15, 30, 60, 120, 1440, 2880, 10080] as const;

export const reminderBody = z
  .object({
    title: z.string().trim().min(1, 'Informe o título.').max(120),
    description: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => v || null),
    category: z.enum(REMINDER_CATEGORIES).default('tarefa'),
    disciplineId: Uuid.nullable().optional().default(null),
    date: day,
    start: hm.nullable(),
    mode: z.enum(['lembrar', 'reservar']).default('lembrar'),
    durationMinutes: z.number().int().min(5).max(1440).nullable().optional().default(null),
    /** Antecedência do aviso em minutos; null: sem aviso. */
    leadMinutes: z.number().int().min(0).max(20160).nullable().default(30),
  })
  .superRefine((b, ctx) => {
    if (b.mode === 'reservar' && (!b.start || !b.durationMinutes))
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinutes'],
        message: 'Para reservar o horário, informe a hora e a duração.',
      });
  });

export const ReminderDto = z.object({
  id: Uuid,
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  disciplineId: Uuid.nullable(),
  date: day,
  start: hm.nullable(),
  mode: z.enum(['lembrar', 'reservar']),
  durationMinutes: z.number().nullable(),
  leadMinutes: z.number().nullable(),
  done: z.boolean(),
  calendarEventId: Uuid.nullable(),
});
export type ReminderDto = z.infer<typeof ReminderDto>;

export const listReminders = defineRoute({
  method: 'get',
  path: '/api/v1/reminders',
  summary: 'Lembretes do aluno: pendentes (padrão), feitos ou todos, em ordem de data.',
  tags: ['lembretes'],
  query: z.object({ status: z.enum(['pendentes', 'feitos', 'todos']).default('pendentes') }),
  response: z.object({ items: z.array(ReminderDto) }),
  errors: ['feature_disabled'],
});

export const createReminder = defineRoute({
  method: 'post',
  path: '/api/v1/reminders',
  summary: 'Cria um lembrete. "Reservar" também ocupa o horário na agenda (LEM-08).',
  tags: ['lembretes'],
  body: reminderBody,
  response: z.object({ reminder: ReminderDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

const params = z.object({ id: Uuid });

export const updateReminder = defineRoute({
  method: 'put',
  path: '/api/v1/reminders/{id}',
  summary: 'Muda o lembrete (e o horário reservado, se houver).',
  tags: ['lembretes'],
  params,
  body: reminderBody,
  response: z.object({ reminder: ReminderDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const setReminderDone = defineRoute({
  method: 'post',
  path: '/api/v1/reminders/{id}/done',
  summary: 'Marca como realizado ou pendente (LEM-06).',
  tags: ['lembretes'],
  params,
  body: z.object({ done: z.boolean() }),
  response: z.object({ reminder: ReminderDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const removeReminder = defineRoute({
  method: 'delete',
  path: '/api/v1/reminders/{id}',
  summary: 'Exclui o lembrete, o aviso e o horário reservado.',
  tags: ['lembretes'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

export const NotificationDto = z.object({
  id: Uuid,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  at: z.string(),
  read: z.boolean(),
});

export const listNotifications = defineRoute({
  method: 'get',
  path: '/api/v1/notifications',
  summary: 'Avisos que já chegaram (os 50 mais recentes) e quantos não foram lidos.',
  tags: ['lembretes'],
  response: z.object({ items: z.array(NotificationDto), unread: z.number().int() }),
  errors: ['feature_disabled'],
});

export const readNotification = defineRoute({
  method: 'post',
  path: '/api/v1/notifications/{id}/read',
  summary: 'Marca o aviso como lido.',
  tags: ['lembretes'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

export const readAllNotifications = defineRoute({
  method: 'post',
  path: '/api/v1/notifications/read-all',
  summary: 'Marca todos os avisos que já chegaram como lidos.',
  tags: ['lembretes'],
  response: z.object({ ok: z.literal(true) }),
  errors: ['feature_disabled'],
});

export const PreferencesDto = z.object({
  emailEnabled: z.boolean(),
  quietFrom: hm.nullable(),
  quietUntil: hm.nullable(),
  dailyCap: z.number().int().min(1).max(50),
  academicAlerts: z.boolean(),
});
export type PreferencesDto = z.infer<typeof PreferencesDto>;

export const getPreferences = defineRoute({
  method: 'get',
  path: '/api/v1/notifications/preferences',
  summary: 'Canais, horário silencioso, teto diário e alertas acadêmicos (LEM-11, 12, 14).',
  tags: ['lembretes'],
  response: z.object({ preferences: PreferencesDto }),
  errors: ['feature_disabled'],
});

export const savePreferences = defineRoute({
  method: 'put',
  path: '/api/v1/notifications/preferences',
  summary: 'Salva as preferências de aviso.',
  tags: ['lembretes'],
  body: PreferencesDto.refine((p) => (p.quietFrom === null) === (p.quietUntil === null), {
    message: 'Informe o início e o fim do horário silencioso, ou nenhum.',
    path: ['quietUntil'],
  }),
  response: z.object({ preferences: PreferencesDto }),
  errors: ['invalid_request', 'feature_disabled'],
});
