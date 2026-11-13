import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Calendário (SPEC v2, CAL-02 a CAL-07 e CAL-16). Cada fato na sua tabela: compromisso em
// calendar_events, aula em lessons, prova e entrega em assessments. A agenda lê todas.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM.');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const EventKind = z.enum(['compromisso', 'estudo', 'revisao', 'lazer', 'descanso', 'outro']);

export const Recurrence = z.discriminatedUnion('freq', [
  z.object({
    freq: z.literal('weekly'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia.'),
    until: day.nullable().optional(),
  }),
  z.object({ freq: z.literal('daily'), until: day.nullable().optional() }),
  z.object({ freq: z.literal('monthly'), until: day.nullable().optional() }),
  z.object({ freq: z.literal('dates'), dates: z.array(day).min(1).max(200) }),
]);

/** Quando: dia e, se não for dia inteiro, início e fim locais. */
const when = {
  date: day,
  start: hm.nullable(),
  end: hm.nullable(),
};

export const eventBody = z
  .object({
    kind: EventKind,
    title: z.string().trim().min(1, 'Informe o título.').max(120),
    notes: optionalText(2000),
    disciplineId: Uuid.nullable().optional().default(null),
    color: z.number().int().min(1).max(8).nullable().optional().default(null),
    blocksTime: z.boolean().default(true),
    recurrence: Recurrence.nullable().optional().default(null),
    ...when,
  })
  .refine((b) => (b.start === null) === (b.end === null), {
    message: 'Informe início e fim, ou nenhum para o dia todo.',
    path: ['end'],
  });

export const EventDto = z.object({
  id: Uuid,
  kind: EventKind,
  title: z.string(),
  notes: z.string().nullable(),
  disciplineId: Uuid.nullable(),
  color: z.number().nullable(),
  blocksTime: z.boolean(),
  date: day,
  start: hm.nullable(),
  end: hm.nullable(),
  recurrence: Recurrence.nullable(),
});
export type EventDto = z.infer<typeof EventDto>;

export const Scope = z.enum(['this', 'following', 'all']);

export const createEvent = defineRoute({
  method: 'post',
  path: '/api/v1/calendar/events',
  summary: 'Cria um compromisso, único ou que se repete (CAL-02, CAL-04).',
  tags: ['calendario'],
  body: eventBody,
  response: z.object({ event: EventDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

const params = z.object({ id: Uuid });

export const getEvent = defineRoute({
  method: 'get',
  path: '/api/v1/calendar/events/{id}',
  summary: 'Um compromisso, com a regra de repetição.',
  tags: ['calendario'],
  params,
  response: z.object({ event: EventDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const updateEvent = defineRoute({
  method: 'put',
  path: '/api/v1/calendar/events/{id}',
  summary:
    'Muda um compromisso. Em série: só esta ocorrência, esta e as próximas, ou toda a série (CAL-04).',
  tags: ['calendario'],
  params,
  body: z.object({
    scope: Scope.default('all'),
    /** Data original da ocorrência clicada (obrigatória para "this" e "following"). */
    occurrenceDate: day.optional(),
    event: eventBody,
  }),
  response: z.object({ event: EventDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const removeEvent = defineRoute({
  method: 'delete',
  path: '/api/v1/calendar/events/{id}',
  summary: 'Exclui um compromisso: só esta ocorrência, esta e as próximas, ou toda a série.',
  tags: ['calendario'],
  params,
  query: z.object({ scope: Scope.default('all'), date: day.optional() }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

// Aula avulsa (do cronograma ou criada à mão).
export const lessonBody = z
  .object({
    disciplineId: Uuid,
    kind: z.enum(['aula', 'pratica', 'outro']).default('aula'),
    title: z.string().trim().min(1, 'Informe o título.').max(200),
    location: optionalText(120),
    ...when,
  })
  .refine((b) => (b.start === null) === (b.end === null), {
    message: 'Informe início e fim, ou nenhum para o dia todo.',
    path: ['end'],
  });

export const LessonDto = z.object({
  id: Uuid,
  disciplineId: Uuid,
  kind: z.enum(['aula', 'pratica', 'outro']),
  title: z.string(),
  location: z.string().nullable(),
  date: day,
  start: hm.nullable(),
  end: hm.nullable(),
  origin: z.enum(['imported', 'manual']),
  modifiedByStudent: z.boolean(),
  /** Como veio do cronograma (CAL-06), quando importada. */
  original: z.record(z.string(), z.unknown()).nullable(),
});

export const createLesson = defineRoute({
  method: 'post',
  path: '/api/v1/lessons',
  summary: 'Aula criada à mão no calendário.',
  tags: ['calendario'],
  body: lessonBody,
  response: z.object({ lesson: LessonDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const updateLesson = defineRoute({
  method: 'put',
  path: '/api/v1/lessons/{id}',
  summary: 'Muda uma aula. Se veio do cronograma, fica marcada como alterada pelo aluno (CAL-06).',
  tags: ['calendario'],
  params,
  body: lessonBody,
  response: z.object({ lesson: LessonDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const removeLesson = defineRoute({
  method: 'delete',
  path: '/api/v1/lessons/{id}',
  summary:
    'Tira a aula da agenda. A do cronograma fica cancelada (e não volta com o próximo cronograma); a criada à mão é apagada.',
  tags: ['calendario'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

// Prova, atividade ou entrega. A nota e o peso entram com o módulo de notas (NOT).
export const assessmentBody = z.object({
  disciplineId: Uuid,
  kind: z.enum(['prova', 'atividade', 'entrega']),
  name: z.string().trim().min(1, 'Informe o nome.').max(200),
  topicNote: optionalText(500),
  date: day,
  start: hm.nullable(),
});

export const AssessmentDto = z.object({
  id: Uuid,
  disciplineId: Uuid,
  kind: z.enum(['prova', 'atividade', 'entrega']),
  name: z.string(),
  topicNote: z.string().nullable(),
  date: day.nullable(),
  start: hm.nullable(),
  origin: z.enum(['imported', 'manual']),
  modifiedByStudent: z.boolean(),
  original: z.record(z.string(), z.unknown()).nullable(),
});

export const createAssessment = defineRoute({
  method: 'post',
  path: '/api/v1/assessments',
  summary: 'Prova, atividade ou entrega criada no calendário (é a mesma das Notas; CAL-16).',
  tags: ['calendario'],
  body: assessmentBody,
  response: z.object({ assessment: AssessmentDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const updateAssessment = defineRoute({
  method: 'put',
  path: '/api/v1/assessments/{id}',
  summary: 'Muda a avaliação. Se veio do cronograma, fica marcada como alterada pelo aluno.',
  tags: ['calendario'],
  params,
  body: assessmentBody,
  response: z.object({ assessment: AssessmentDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const removeAssessment = defineRoute({
  method: 'delete',
  path: '/api/v1/assessments/{id}',
  summary: 'Exclui a avaliação (e a nota, se houver).',
  tags: ['calendario'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});
