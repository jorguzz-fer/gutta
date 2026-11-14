import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Faltas (SPEC v2, 5.12). Controle pessoal em horas-aula; não é o registro da instituição.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const hours = z.number().positive('Informe as horas-aula.').max(24);

export const RuleDto = z.object({
  totalClassHours: z.number().positive(),
  minAttendancePct: z.number().min(0).max(100),
  classHoursPerMeeting: z.number().positive(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable(),
  alertThresholds: z.array(z.number().int().min(1).max(100)),
});
export type RuleDto = z.infer<typeof RuleDto>;

export const ruleBody = z.object({
  totalClassHours: z.number().positive('Informe a carga horária.').max(2000),
  minAttendancePct: z.number().min(0).max(100),
  classHoursPerMeeting: z.number().positive().max(24).default(2),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable().default(null),
  alertThresholds: z.array(z.number().int().min(1).max(100)).max(5).default([50, 75, 90]),
});

export const AbsenceDto = z.object({
  id: Uuid,
  lessonId: Uuid.nullable(),
  date: day,
  /** Tema da aula, quando veio do cronograma. */
  lessonTitle: z.string().nullable(),
  classHours: z.number(),
  note: z.string().nullable(),
});

export const ClassDayDto = z.object({
  date: day,
  lessonId: Uuid.nullable(),
  title: z.string().nullable(),
  classHours: z.number(),
  absenceId: Uuid.nullable(),
});

export const AttendanceDto = z.object({
  disciplineId: Uuid,
  disciplineName: z.string(),
  rule: RuleDto.nullable(),
  summary: z
    .object({
      limit: z.number(),
      registered: z.number(),
      remaining: z.number(),
      usedPct: z.number(),
      status: z.enum(['dentro', 'atencao', 'no_limite', 'acima']),
      reachedThresholds: z.array(z.number()),
    })
    .nullable(),
  /** Dias de aula do mês pedido: do cronograma ou, sem ele, dos dias configurados. */
  month: z.string(),
  classDays: z.array(ClassDayDto),
  absences: z.array(AbsenceDto),
});
export type AttendanceDto = z.infer<typeof AttendanceDto>;

const params = z.object({ id: Uuid });

export const getAttendance = defineRoute({
  method: 'get',
  path: '/api/v1/disciplines/{id}/attendance',
  summary: 'Regra, indicadores, dias de aula do mês e histórico de faltas da disciplina.',
  tags: ['faltas'],
  params,
  query: z.object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  response: z.object({ attendance: AttendanceDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const saveRule = defineRoute({
  method: 'put',
  path: '/api/v1/disciplines/{id}/attendance/rule',
  summary: 'Configura carga horária, frequência mínima, horas-aula por encontro e avisos (FAL-01).',
  tags: ['faltas'],
  params,
  body: ruleBody,
  response: z.object({ attendance: AttendanceDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const recordAbsence = defineRoute({
  method: 'post',
  path: '/api/v1/disciplines/{id}/absences',
  summary:
    'Registra a ausência numa aula (integral ou parcial). Registrar de novo atualiza (FAL-09).',
  tags: ['faltas'],
  params,
  body: z.object({
    date: day,
    lessonId: Uuid.nullable().default(null),
    classHours: hours,
    note: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((v) => v || null),
  }),
  response: z.object({ attendance: AttendanceDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const removeAbsence = defineRoute({
  method: 'delete',
  path: '/api/v1/disciplines/{id}/absences/{absenceId}',
  summary: 'Remove o registro de ausência.',
  tags: ['faltas'],
  params: z.object({ id: Uuid, absenceId: Uuid }),
  response: z.object({ attendance: AttendanceDto }),
  errors: ['not_found', 'feature_disabled'],
});
