import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Notas e calculadora (SPEC v2, 5.13). Nota lançada pelo aluno nunca é registro oficial
// (NOT-19). A avaliação é a mesma da agenda (CAL-16).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Method = z.enum(['simples', 'pesos', 'percentual']);

export const GradeAssessmentDto = z.object({
  id: Uuid,
  kind: z.enum(['prova', 'atividade', 'entrega']),
  name: z.string(),
  date: day.nullable(),
  grade: z.number().nullable(),
  maxGrade: z.number(),
  weight: z.number().nullable(),
  percent: z.number().nullable(),
});

export const GradesDto = z.object({
  disciplineId: Uuid,
  disciplineName: z.string(),
  scheme: z.object({ method: Method, minGrade: z.number(), configured: z.boolean() }),
  assessments: z.array(GradeAssessmentDto),
  summary: z.object({
    current: z.number().nullable(),
    graded: z.number().int(),
    pending: z.number().int(),
    doneShare: z.number(),
    remainingShare: z.number(),
    percentTotal: z.number().nullable(),
  }),
  /** Para a média mínima, com o que falta lançar. */
  needed: z.object({
    status: z.enum(['garantida', 'alcancavel', 'inalcancavel', 'sem_restantes']),
    needed: z.number().nullable(),
  }),
  cumulative: z.array(z.number()),
});
export type GradesDto = z.infer<typeof GradesDto>;

const params = z.object({ id: Uuid });

export const getGrades = defineRoute({
  method: 'get',
  path: '/api/v1/disciplines/{id}/grades',
  summary: 'Forma de cálculo, avaliações com notas, média atual e nota necessária.',
  tags: ['notas'],
  params,
  response: z.object({ grades: GradesDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const saveScheme = defineRoute({
  method: 'put',
  path: '/api/v1/disciplines/{id}/grades/scheme',
  summary: 'Forma de cálculo da média e nota mínima de aprovação (NOT-01, NOT-02, NOT-04).',
  tags: ['notas'],
  params,
  body: z.object({ method: Method, minGrade: z.number().min(0).max(10) }),
  response: z.object({ grades: GradesDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const saveGrade = defineRoute({
  method: 'put',
  path: '/api/v1/assessments/{id}/grade',
  summary: 'Nota (vazia = pendente), peso, porcentagem e nota máxima da avaliação (NOT-08).',
  tags: ['notas'],
  params,
  body: z
    .object({
      grade: z.number().min(0).nullable(),
      maxGrade: z.number().positive().max(1000).default(10),
      weight: z.number().min(0).max(100).nullable().default(null),
      percent: z.number().min(0).max(100).nullable().default(null),
    })
    .refine((b) => b.grade === null || b.grade <= b.maxGrade, {
      message: 'A nota não pode passar da nota máxima.',
      path: ['grade'],
    }),
  response: z.object({ grades: GradesDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});
