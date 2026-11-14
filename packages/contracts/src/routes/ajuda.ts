import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Ajuda Cognuss (SPEC v2, 5.14; ADR 0020). Gerar roda na fila, com estado visível; toda
// criação traz as páginas de origem e o selo de IA. O gabarito das questões só sai depois da
// tentativa (IA-9).

export const CreationType = z.enum(['resumo', 'flashcards', 'questoes', 'mapa', 'roteiro']);
export const Level = z.enum(['basico', 'intermediario', 'avancado']);
export const SummaryStyle = z.enum(['sintetico', 'completo', 'esquematizado', 'comparativo']);

export const JobDto = z.object({
  id: Uuid,
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
  type: CreationType,
  error: z.string().nullable(),
  resultId: Uuid.nullable(),
  createdAt: z.string(),
});
export type JobDto = z.infer<typeof JobDto>;

export const CreationSummaryDto = z.object({
  id: Uuid,
  type: CreationType,
  level: Level,
  title: z.string(),
  disciplineId: Uuid.nullable(),
  disciplineName: z.string().nullable(),
  /** Material novo no tema ou disciplina depois de gerada (AJU-11). */
  stale: z.boolean(),
  edited: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceTitles: z.array(z.string()),
});
export type CreationSummaryDto = z.infer<typeof CreationSummaryDto>;

export const SourceDto = z.object({
  ref: z.string(),
  label: z.string(),
  materialId: Uuid.nullable(),
  page: z.number().int(),
});

/** Questão sem gabarito; com a última tentativa, o gabarito e o comentário aparecem. */
export const QuestionDto = z.object({
  id: Uuid,
  position: z.number().int(),
  kind: z.enum(['objetiva', 'discursiva']),
  stem: z.string(),
  options: z.array(z.string()),
  difficulty: z.string(),
  refs: z.array(z.string()),
  answer: z
    .object({
      chosenIndex: z.number().int().nullable(),
      answerText: z.string().nullable(),
      correct: z.boolean().nullable(),
      correctIndex: z.number().int().nullable(),
      expected: z.string().nullable(),
      comment: z.string(),
    })
    .nullable(),
});
export type QuestionDto = z.infer<typeof QuestionDto>;

export const CreationDto = CreationSummaryDto.extend({
  /** Conteúdo conforme o tipo. Nas questões, sem gabarito: elas vêm em `questions`. */
  content: z.record(z.string(), z.unknown()),
  sources: z.array(SourceDto),
  warnings: z.array(z.string()),
  questions: z.array(QuestionDto),
  model: z.string().nullable(),
});
export type CreationDto = z.infer<typeof CreationDto>;

export const createJob = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/jobs',
  summary:
    'Criar com IA (AJU-01): materiais, o que criar, nível e instruções. Roda na fila; acompanhe pelo estado.',
  tags: ['ajuda'],
  idempotent: true,
  body: z.object({
    type: CreationType,
    level: Level.default('intermediario'),
    style: SummaryStyle.optional(),
    count: z.number().int().min(3).max(30).optional(),
    instructions: z.string().trim().max(2000).nullable().optional(),
    materialIds: z.array(Uuid).min(1, 'Escolha pelo menos um material.').max(20),
    disciplineId: Uuid.nullable().optional(),
    /** Autoriza a IA a ler os materiais (a mesma autorização do cronograma). */
    grantConsent: z.boolean().optional(),
  }),
  response: JobDto,
  status: 201,
  errors: ['feature_disabled', 'not_found', 'invalid_request', 'conflict'],
});

export const getJob = defineRoute({
  method: 'get',
  path: '/api/v1/ajuda/jobs/{id}',
  summary: 'Estado de uma geração.',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: JobDto,
  errors: ['feature_disabled', 'not_found'],
});

export const cancelJob = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/jobs/{id}/cancel',
  summary: 'Cancela uma geração que ainda não terminou.',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: JobDto,
  errors: ['feature_disabled', 'not_found'],
});

export const listCreations = defineRoute({
  method: 'get',
  path: '/api/v1/ajuda/creations',
  summary: 'Minhas criações (AJU-10), por disciplina e tipo.',
  tags: ['ajuda'],
  query: z.object({ disciplineId: Uuid.optional(), type: CreationType.optional() }),
  response: z.object({ items: z.array(CreationSummaryDto) }),
  errors: ['feature_disabled'],
});

export const getCreation = defineRoute({
  method: 'get',
  path: '/api/v1/ajuda/creations/{id}',
  summary: 'Uma criação, com as páginas de origem (IA-2).',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: CreationDto,
  errors: ['feature_disabled', 'not_found'],
});

export const updateCreation = defineRoute({
  method: 'patch',
  path: '/api/v1/ajuda/creations/{id}',
  summary:
    'Renomear ou editar o conteúdo (IA-6). O conteúdo editado é validado pelo esquema do tipo.',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.record(z.string(), z.unknown()).optional(),
  }),
  response: CreationDto,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const deleteCreation = defineRoute({
  method: 'delete',
  path: '/api/v1/ajuda/creations/{id}',
  summary: 'Exclui a criação (e os flashcards e questões gerados por ela).',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['feature_disabled', 'not_found'],
});

export const regenerateCreation = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/creations/{id}/regenerate',
  summary: 'Gera de novo com os mesmos materiais e escolhas (IA-6, AJU-11).',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: JobDto,
  status: 201,
  errors: ['feature_disabled', 'not_found', 'conflict'],
});

export const answerQuestion = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/questions/{id}/attempts',
  summary:
    'Responde uma questão gerada (MEM-03). A correção é no servidor; o gabarito e o comentário só voltam depois.',
  tags: ['ajuda'],
  idempotent: true,
  params: z.object({ id: Uuid }),
  body: z.object({
    chosenIndex: z.number().int().min(0).max(9).nullable().optional(),
    answerText: z.string().trim().max(4000).nullable().optional(),
  }),
  response: QuestionDto,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

// Tutor sobre os materiais (AJU-08, AUL-17). Responde citando as páginas usadas.

export const TutorScope = z.enum(['materiais', 'aula', 'slide']);

export const TutorMessageDto = z.object({
  id: Uuid,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  citations: z.array(SourceDto),
  createdAt: z.string(),
});

export const TutorThreadDto = z.object({
  id: Uuid,
  scope: TutorScope,
  title: z.string(),
  sourceTitles: z.array(z.string()),
  /** Dúvidas registradas na aula (AJU-09), como sugestões de pergunta. */
  doubts: z.array(z.string()),
  remaining: z.number().int(),
  dailyLimit: z.number().int(),
  messages: z.array(TutorMessageDto),
});
export type TutorThreadDto = z.infer<typeof TutorThreadDto>;

export const createTutorThread = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/tutor/threads',
  summary:
    'Abre uma conversa com o tutor sobre materiais escolhidos, uma aula ou um slide (AJU-08, AUL-17).',
  tags: ['ajuda'],
  idempotent: true,
  body: z.object({
    scope: TutorScope,
    materialIds: z.array(Uuid).max(20).optional(),
    lessonId: Uuid.optional(),
    materialId: Uuid.optional(),
    page: z.number().int().min(1).optional(),
    grantConsent: z.boolean().optional(),
  }),
  response: TutorThreadDto,
  status: 201,
  errors: ['feature_disabled', 'not_found', 'invalid_request', 'conflict'],
});

export const getTutorThread = defineRoute({
  method: 'get',
  path: '/api/v1/ajuda/tutor/threads/{id}',
  summary: 'Uma conversa com o tutor, com as páginas citadas em cada resposta.',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  response: TutorThreadDto,
  errors: ['feature_disabled', 'not_found'],
});

export const askTutorThread = defineRoute({
  method: 'post',
  path: '/api/v1/ajuda/tutor/threads/{id}/messages',
  summary: 'Pergunta ao tutor. A resposta cita as páginas e diz quando o material não cobre.',
  tags: ['ajuda'],
  params: z.object({ id: Uuid }),
  body: z.object({ message: z.string().trim().min(3, 'Escreva sua dúvida.').max(1500) }),
  response: TutorThreadDto,
  errors: ['feature_disabled', 'not_found', 'rate_limited', 'unavailable'],
});

export const listTutorThreads = defineRoute({
  method: 'get',
  path: '/api/v1/ajuda/tutor/threads',
  summary: 'Conversas recentes com o tutor.',
  tags: ['ajuda'],
  response: z.object({
    items: z.array(
      z.object({ id: Uuid, scope: TutorScope, title: z.string(), updatedAt: z.string() }),
    ),
  }),
  errors: ['feature_disabled'],
});
