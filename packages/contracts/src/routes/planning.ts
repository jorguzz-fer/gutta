import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Equilíbrio (SPEC v2, 5.4 e 7.5). O motor calcula; o aluno decide (R10). Só a sessão
// confirmada entra na agenda.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário no formato HH:MM.');

export const Period = z.enum(['manha', 'tarde', 'noite', 'varia']);
export const Intensity = z.enum(['leve', 'equilibrada', 'intensiva']);
export const Priority = z.enum(['bem_estar', 'avaliacoes', 'dificuldade', 'distribuicao']);
export const TaskOrigin = z.enum(['aula', 'falta', 'prova', 'nota', 'aluno', 'memory']);
export const TaskStatus = z.enum(['pendente', 'concluida', 'adiada', 'descartada']);
export const Difficulty = z.enum(['facil', 'moderado', 'dificil']);
export const Importance = z.enum(['nenhuma', 'importante', 'alta']);
export const SessionStatus = z.enum([
  'proposed',
  'confirmed',
  'done',
  'partly_done',
  'skipped',
  'rescheduled',
]);

export const PreferencesDto = z.object({
  preferredPeriod: Period,
  sessionMinutes: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  intensity: Intensity,
  priority: Priority,
  dailyLimitMinutes: z.number().int().min(0).max(1440).nullable(),
  weeklyLimitMinutes: z.number().int().min(0).max(6000).nullable(),
  breakMinutes: z.number().int().min(5).max(30),
  maxConsecutive: z.number().int().min(1).max(4),
  longBreakMinutes: z.number().int().min(10).max(120),
  avoidAfterLongJourney: z.boolean(),
});
export type PreferencesDto = z.infer<typeof PreferencesDto>;

export const TaskDto = z.object({
  id: Uuid,
  title: z.string(),
  disciplineId: Uuid.nullable(),
  disciplineName: z.string().nullable(),
  origin: TaskOrigin,
  status: TaskStatus,
  estimatedMinutes: z.number().int(),
  doneMinutes: z.number().int(),
  /** Minutos em sessões confirmadas ainda não feitas. */
  plannedMinutes: z.number().int(),
  dueAt: z.string().nullable(),
  dueDate: day.nullable(),
  difficulty: Difficulty.nullable(),
  importance: Importance.nullable(),
  lessonId: Uuid.nullable(),
  assessmentId: Uuid.nullable(),
});
export type TaskDto = z.infer<typeof TaskDto>;

export const SessionDto = z.object({
  id: Uuid,
  taskId: Uuid.nullable(),
  proposalId: Uuid.nullable(),
  title: z.string(),
  disciplineId: Uuid.nullable(),
  disciplineName: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  date: day,
  startLocal: hm,
  endLocal: hm,
  minutes: z.number().int(),
  status: SessionStatus,
  /** Por que esta sessão foi sugerida, em linguagem simples (R11, EQU-08). */
  reasons: z.array(z.string()),
  part: z.number().int().nullable(),
  parts: z.number().int().nullable(),
  doneMinutes: z.number().int().nullable(),
});
export type SessionDto = z.infer<typeof SessionDto>;

export const UnplacedDto = z.object({
  taskId: Uuid,
  title: z.string(),
  minutes: z.number().int(),
  reason: z.enum(['prazo', 'limite_diario', 'limite_semanal', 'intensidade', 'sem_horario']),
  /** O motivo em linguagem simples, com o que dá para fazer (EQU-09). */
  explanation: z.string(),
});

export const ProposalDto = z.object({
  id: Uuid,
  weekStart: day,
  kind: z.enum(['semana', 'replanejar']),
  status: z.enum(['proposed', 'accepted', 'partly_accepted', 'rejected', 'superseded']),
  createdAt: z.string(),
  sessions: z.array(SessionDto),
  unplaced: z.array(UnplacedDto),
  capacity: z.object({
    windowMinutes: z.number().int(),
    usableMinutes: z.number().int(),
    proposedMinutes: z.number().int(),
  }),
});
export type ProposalDto = z.infer<typeof ProposalDto>;

export const WeekDto = z.object({
  weekStart: day,
  days: z.array(day),
  today: day,
  /** Três indicadores separados (EQU-10): para melhorar as sugestões, não para julgar. */
  indicators: z.object({
    availableMinutes: z.number().int(),
    plannedMinutes: z.number().int(),
    doneMinutes: z.number().int(),
  }),
  /** "Minha semana está equilibrada?" (EQU-16). */
  balance: z.object({
    state: z.enum(['equilibrada', 'intensa', 'revisar']),
    message: z.string(),
  }),
  sessions: z.array(SessionDto),
  /** Sessões confirmadas que já passaram sem registro (EQU-14). Nada se move sozinho. */
  behind: z.array(SessionDto),
  proposal: ProposalDto.nullable(),
  tasks: z.array(TaskDto),
  preferences: PreferencesDto,
  /** Sem janela de estudo na rotina, não há o que propor (ROT-08). */
  hasStudyWindows: z.boolean(),
});
export type WeekDto = z.infer<typeof WeekDto>;

export const getPreferences = defineRoute({
  method: 'get',
  path: '/api/v1/planning/preferences',
  summary: 'Preferências do Equilíbrio (EQU-01 a EQU-03), com os padrões da SPEC.',
  tags: ['equilibrio'],
  response: PreferencesDto,
  errors: ['feature_disabled'],
});

export const savePreferences = defineRoute({
  method: 'put',
  path: '/api/v1/planning/preferences',
  summary: 'Muda as preferências; alterável a qualquer momento (EQU-01).',
  tags: ['equilibrio'],
  body: PreferencesDto,
  response: PreferencesDto,
  errors: ['feature_disabled', 'invalid_request'],
});

export const getWeek = defineRoute({
  method: 'get',
  path: '/api/v1/planning/week',
  summary: 'Semana planejada: indicadores, equilíbrio, sessões, pendências e a proposta aberta.',
  tags: ['equilibrio'],
  query: z.object({ semana: day.optional() }),
  response: WeekDto,
  errors: ['feature_disabled'],
});

export const createProposal = defineRoute({
  method: 'post',
  path: '/api/v1/planning/proposals',
  summary:
    'Gera uma proposta (EQU-06) ou um replanejamento (EQU-12). Nada entra na agenda antes da confirmação.',
  tags: ['equilibrio'],
  body: z.object({
    semana: day.optional(),
    kind: z.enum(['semana', 'replanejar']).default('semana'),
    /** "Pedir outro plano" (EQU-07). */
    variant: z.number().int().min(0).max(1000).optional(),
    /** Replanejar: as sessões a reorganizar. Sem a lista, as que ficaram para trás e as da semana. */
    sessionIds: z.array(Uuid).max(200).optional(),
  }),
  response: ProposalDto,
  status: 201,
  errors: ['feature_disabled', 'invalid_request'],
});

export const decideProposal = defineRoute({
  method: 'post',
  path: '/api/v1/planning/proposals/{id}/decision',
  summary: 'Aceita tudo, aceita em parte ou recusa (EQU-07). Lista vazia recusa.',
  tags: ['equilibrio'],
  idempotent: true,
  params: z.object({ id: Uuid }),
  body: z.object({
    accept: z.array(Uuid).max(200),
    /** Motivo opcional do reagendamento (EQU-13). */
    reason: z.string().trim().max(200).optional(),
  }),
  response: z.object({ status: ProposalDto.shape.status, confirmed: z.number().int() }),
  errors: ['feature_disabled', 'not_found', 'conflict'],
});

export const updateSession = defineRoute({
  method: 'patch',
  path: '/api/v1/planning/sessions/{id}',
  summary: 'Edita horário, duração ou conteúdo de uma sessão proposta ou confirmada (EQU-07).',
  tags: ['equilibrio'],
  params: z.object({ id: Uuid }),
  body: z.object({
    date: day.optional(),
    start: hm.optional(),
    minutes: z.number().int().min(10).max(180).optional(),
    title: z.string().trim().min(1).max(200).optional(),
  }),
  response: SessionDto,
  errors: ['feature_disabled', 'not_found', 'conflict'],
});

export const markSession = defineRoute({
  method: 'post',
  path: '/api/v1/planning/sessions/{id}/status',
  summary:
    'Registro opcional, de um toque (EQU-11): feita, feita em parte, deixada de lado ou desfazer.',
  tags: ['equilibrio'],
  idempotent: true,
  params: z.object({ id: Uuid }),
  body: z.object({
    status: z.enum(['done', 'partly_done', 'skipped', 'confirmed']),
    minutes: z.number().int().min(1).max(600).optional(),
  }),
  response: SessionDto,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const deleteSession = defineRoute({
  method: 'delete',
  path: '/api/v1/planning/sessions/{id}',
  summary: 'Tira uma sessão da agenda; a tarefa volta para as pendentes.',
  tags: ['equilibrio'],
  params: z.object({ id: Uuid }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['feature_disabled', 'not_found'],
});

export const listTasks = defineRoute({
  method: 'get',
  path: '/api/v1/planning/tasks',
  summary: 'Tarefas do Equilíbrio (a demanda do motor).',
  tags: ['equilibrio'],
  query: z.object({ status: TaskStatus.optional() }),
  response: z.object({ items: z.array(TaskDto) }),
  errors: ['feature_disabled'],
});

export const createTask = defineRoute({
  method: 'post',
  path: '/api/v1/planning/tasks',
  summary: 'Tarefa criada pelo aluno.',
  tags: ['equilibrio'],
  idempotent: true,
  body: z.object({
    title: z.string().trim().min(1, 'Informe a tarefa.').max(200),
    disciplineId: Uuid.nullable().optional().default(null),
    estimatedMinutes: z.number().int().min(10).max(1200),
    dueDate: day.nullable().optional().default(null),
    difficulty: Difficulty.nullable().optional().default(null),
    importance: Importance.nullable().optional().default(null),
  }),
  response: TaskDto,
  status: 201,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const updateTask = defineRoute({
  method: 'patch',
  path: '/api/v1/planning/tasks/{id}',
  summary: 'Adiar, descartar, reabrir ou ajustar uma tarefa (EQU-12, EQU-14).',
  tags: ['equilibrio'],
  params: z.object({ id: Uuid }),
  body: z.object({
    status: TaskStatus.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    estimatedMinutes: z.number().int().min(10).max(1200).optional(),
    difficulty: Difficulty.nullable().optional(),
    importance: Importance.nullable().optional(),
  }),
  response: TaskDto,
  errors: ['feature_disabled', 'not_found'],
});

export const createRequest = defineRoute({
  method: 'post',
  path: '/api/v1/planning/requests',
  summary:
    'Pedido de outro módulo (EQU-18): revisão da aula (AUL-22), da aula perdida (FAL-08), para a prova (CAL-10) ou do tema da nota (NOT-15). Vira tarefa, uma só por pedido.',
  tags: ['equilibrio'],
  idempotent: true,
  body: z.object({
    kind: z.enum(['aula', 'falta', 'prova', 'nota']),
    /** Aula, falta ou avaliação de origem. */
    id: Uuid,
  }),
  response: TaskDto,
  errors: ['feature_disabled', 'not_found'],
});
