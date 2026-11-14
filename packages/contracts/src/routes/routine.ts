import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Rotina semanal (SPEC v2, 5.3). Blocos que se repetem nos dias escolhidos; a grade mostra
// também as aulas do cronograma da semana, que não se editam por aqui (ROT-05).

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

export const RoutineKind = z.enum(['aula', 'estudo', 'pessoal']);
export const PERSONAL_CATEGORY_KEYS = [
  'sono',
  'refeicao',
  'lazer',
  'academia',
  'esporte',
  'idiomas',
  'trabalho',
  'descanso',
  'bloqueado',
  'personalizada',
] as const;

export const RoutineBlockDto = z.object({
  id: Uuid,
  kind: RoutineKind,
  category: z.string().nullable(),
  label: z.string(),
  disciplineId: Uuid.nullable(),
  color: z.number().int().min(1).max(8).nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)),
  start: hm,
  /** Fim no relógio; igual ou antes do início passa da meia-noite. */
  end: hm,
  durationMinutes: z.number().int(),
});
export type RoutineBlockDto = z.infer<typeof RoutineBlockDto>;

export const routineBlockBody = z
  .object({
    kind: RoutineKind,
    category: z.enum(PERSONAL_CATEGORY_KEYS).nullable().default(null),
    label: z.string().trim().max(60).nullable().default(null),
    disciplineId: Uuid.nullable().default(null),
    color: z.number().int().min(1).max(8).nullable().default(null),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia.').max(7),
    start: hm,
    end: hm,
  })
  .superRefine((b, ctx) => {
    if (b.kind === 'aula' && !b.disciplineId)
      ctx.addIssue({ code: 'custom', path: ['disciplineId'], message: 'Escolha a disciplina.' });
    if (b.kind === 'pessoal' && !b.category)
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Escolha a atividade.' });
    if (b.kind === 'pessoal' && b.category === 'personalizada' && !b.label)
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'Dê um nome à atividade.' });
    if (b.start === b.end)
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'O fim precisa ser diferente do início.',
      });
  });

export const PreferencesDto = z.object({
  weeklyGoalMinutes: z.number().int().min(0).max(6000),
  gridStepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  viewStartMinute: z.number().int().min(0).max(1380),
  viewEndMinute: z.number().int().min(60).max(1440),
});
export type PreferencesDto = z.infer<typeof PreferencesDto>;

/** Aula do cronograma na semana mostrada (só leitura na grade). */
export const WeekLessonDto = z.object({
  id: Uuid,
  kind: z.enum(['aula', 'pratica', 'outro']),
  title: z.string(),
  disciplineId: Uuid,
  date: day,
  start: hm,
  end: hm.nullable(),
  allDay: z.boolean(),
});

export const RoutineDto = z.object({
  week: z.object({ start: day, days: z.array(day) }),
  blocks: z.array(RoutineBlockDto),
  lessons: z.array(WeekLessonDto),
  disciplines: z.array(
    z.object({ id: Uuid, name: z.string(), shortName: z.string().nullable(), color: z.number() }),
  ),
  preferences: PreferencesDto,
  summary: z.object({
    classMinutes: z.number().int(),
    studyMinutes: z.number().int(),
    otherMinutes: z.number().int(),
    totalMinutes: z.number().int(),
  }),
  goal: z.object({
    goalMinutes: z.number().int(),
    plannedMinutes: z.number().int(),
    percent: z.number().int(),
    missingMinutes: z.number().int(),
    extraMinutes: z.number().int(),
    message: z.string(),
  }),
});
export type RoutineDto = z.infer<typeof RoutineDto>;

export const getRoutine = defineRoute({
  method: 'get',
  path: '/api/v1/routine',
  summary:
    'Rotina da semana: blocos, aulas do cronograma da semana, preferências, resumo e meta. Sem semana, a atual (ou a próxima com aulas, se a atual não tiver).',
  tags: ['rotina'],
  query: z.object({ week: day.optional() }),
  response: z.object({ routine: RoutineDto }),
  errors: ['invalid_request', 'feature_disabled'],
});

export const createBlock = defineRoute({
  method: 'post',
  path: '/api/v1/routine/blocks',
  summary: 'Adiciona uma atividade que se repete nos dias escolhidos (ROT-03, ROT-04).',
  tags: ['rotina'],
  body: routineBlockBody,
  response: z.object({ block: RoutineBlockDto }),
  status: 201,
  errors: ['invalid_request', 'conflict', 'not_found', 'feature_disabled'],
});

const params = z.object({ id: Uuid });

export const updateBlock = defineRoute({
  method: 'put',
  path: '/api/v1/routine/blocks/{id}',
  summary: 'Muda a atividade em todos os dias dela.',
  tags: ['rotina'],
  params,
  body: routineBlockBody,
  response: z.object({ block: RoutineBlockDto }),
  errors: ['invalid_request', 'conflict', 'not_found', 'feature_disabled'],
});

export const removeBlock = defineRoute({
  method: 'delete',
  path: '/api/v1/routine/blocks/{id}',
  summary: 'Tira a atividade. Com weekday, tira só daquele dia da semana.',
  tags: ['rotina'],
  params,
  query: z.object({ weekday: z.coerce.number().int().min(0).max(6).optional() }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

export const savePreferences = defineRoute({
  method: 'put',
  path: '/api/v1/routine/preferences',
  summary: 'Meta semanal de estudo (ROT-09) e configuração da grade (ROT-01).',
  tags: ['rotina'],
  body: PreferencesDto.refine((p) => p.viewEndMinute > p.viewStartMinute, {
    message: 'O fim da grade precisa ser depois do início.',
    path: ['viewEndMinute'],
  }),
  response: z.object({ preferences: PreferencesDto }),
  errors: ['invalid_request', 'feature_disabled'],
});
