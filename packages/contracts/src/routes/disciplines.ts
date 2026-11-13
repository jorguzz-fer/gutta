import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';
import { FileDto } from './files';

// Disciplinas do aluno (SPEC v2, DIS-01 a DIS-03 e DIS-10). Ficam no semestre atual; o
// semestre é criado na primeira disciplina, se ainda não existir.

export const DocumentKind = z.enum(['cronograma', 'plano_ensino']);

export const DisciplineDto = z.object({
  id: Uuid,
  name: z.string(),
  shortName: z.string().nullable(),
  color: z.number().int().min(1).max(8),
  teachers: z.array(z.object({ id: Uuid, name: z.string() })),
  documents: z.array(z.object({ id: Uuid, kind: DocumentKind, file: FileDto })),
});
export type DisciplineDto = z.infer<typeof DisciplineDto>;

const teacherName = z.string().trim().min(2, 'Nome do docente muito curto.').max(120);

export const disciplineBody = z.object({
  name: z.string().trim().min(2, 'Informe o nome da disciplina.').max(120),
  shortName: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => v || null),
  color: z.number().int().min(1).max(8).default(6),
  teachers: z.array(teacherName).max(10, 'No máximo 10 docentes.').default([]),
});

export const listDisciplines = defineRoute({
  method: 'get',
  path: '/api/v1/disciplines',
  summary: 'Disciplinas do semestre atual do aluno, com docentes e documentos.',
  tags: ['disciplinas'],
  response: z.object({ items: z.array(DisciplineDto) }),
  errors: ['feature_disabled'],
});

export const createDiscipline = defineRoute({
  method: 'post',
  path: '/api/v1/disciplines',
  summary: 'Adiciona uma disciplina ao semestre atual.',
  tags: ['disciplinas'],
  body: disciplineBody,
  response: z.object({ discipline: DisciplineDto }),
  status: 201,
  errors: ['conflict', 'feature_disabled'],
});

const params = z.object({ id: Uuid });

export const updateDiscipline = defineRoute({
  method: 'patch',
  path: '/api/v1/disciplines/{id}',
  summary: 'Muda nome, sigla, cor ou docentes. A lista de docentes enviada substitui a anterior.',
  tags: ['disciplinas'],
  params,
  body: disciplineBody,
  response: z.object({ discipline: DisciplineDto }),
  errors: ['not_found', 'conflict', 'feature_disabled'],
});

export const removeDiscipline = defineRoute({
  method: 'delete',
  path: '/api/v1/disciplines/{id}',
  summary: 'Tira a disciplina do semestre (arquiva; os documentos continuam na biblioteca).',
  tags: ['disciplinas'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

export const attachDocument = defineRoute({
  method: 'post',
  path: '/api/v1/disciplines/{id}/documents',
  summary: 'Liga um arquivo já enviado como cronograma ou plano de ensino da disciplina.',
  tags: ['disciplinas'],
  idempotent: true,
  params,
  body: z.object({ kind: DocumentKind, fileId: Uuid }),
  response: z.object({ discipline: DisciplineDto }),
  status: 201,
  errors: ['not_found', 'invalid_request', 'feature_disabled'],
});

export const detachDocument = defineRoute({
  method: 'delete',
  path: '/api/v1/disciplines/{id}/documents/{documentId}',
  summary: 'Desfaz o vínculo do documento (o arquivo continua na biblioteca).',
  tags: ['disciplinas'],
  params: z.object({ id: Uuid, documentId: Uuid }),
  response: z.object({ discipline: DisciplineDto }),
  errors: ['not_found', 'feature_disabled'],
});

/** Tipos aceitos como cronograma (DIS-02). O plano de ensino aceita os mesmos. */
export const SCHEDULE_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export const MAX_SCHEDULE_BYTES = 10 * 1024 * 1024;
