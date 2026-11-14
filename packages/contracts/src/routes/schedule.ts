import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Importação do cronograma (SPEC v2, DIS-05 e DIS-07). A IA lê no worker; o aluno confere,
// corrige e confirma. Só depois da confirmação os itens viram aulas e avaliações.

export const SCHEDULE_TYPES = [
  'aula',
  'pratica',
  'prova',
  'atividade',
  'entrega',
  'outro',
] as const;
export const ScheduleType = z.enum(SCHEDULE_TYPES);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const hm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM.')
  .nullable();

/** Item do cronograma em horário local do aluno. */
export const ScheduleItem = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.'),
  start: hm,
  end: hm,
  type: ScheduleType,
  title: z.string().trim().min(1, 'Informe o título.').max(200),
  topic: optionalText(200),
  teacher: optionalText(120),
  location: optionalText(120),
});
export type ScheduleItem = z.infer<typeof ScheduleItem>;

/** Item como a IA leu, com o que ajuda a conferir. */
export const ExtractedItem = ScheduleItem.extend({
  confidence: z.enum(['alta', 'media', 'baixa']),
  source: z.string(),
  note: z.string().nullable(),
});
export type ExtractedItem = z.infer<typeof ExtractedItem>;

/** Evento já na agenda que veio de um cronograma anterior (para mostrar a diferença). */
export const ImportedEventDto = z.object({
  id: Uuid,
  table: z.enum(['lesson', 'assessment']),
  original: ScheduleItem,
  modifiedByStudent: z.boolean(),
});

export const ImportStatus = z.enum([
  'waiting_file',
  'needs_consent',
  'extracting',
  'ready',
  'confirmed',
  'rejected',
  'failed',
]);

export const ScheduleImportDto = z.object({
  id: Uuid,
  disciplineId: Uuid,
  disciplineName: z.string(),
  fileId: Uuid,
  fileName: z.string(),
  status: ImportStatus,
  error: z.string().nullable(),
  referenceYear: z.number().int(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  /** Só com status "ready". */
  items: z.array(ExtractedItem).nullable(),
  warnings: z.array(z.string()),
  /** Eventos importados antes nesta disciplina. */
  existing: z.array(ImportedEventDto),
});
export type ScheduleImportDto = z.infer<typeof ScheduleImportDto>;

const params = z.object({ id: Uuid });

export const getImport = defineRoute({
  method: 'get',
  path: '/api/v1/schedule-imports/{id}',
  summary: 'Estado da leitura do cronograma e, quando pronta, os itens para conferir.',
  tags: ['cronograma'],
  params,
  response: z.object({ import: ScheduleImportDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const confirmImport = defineRoute({
  method: 'post',
  path: '/api/v1/schedule-imports/{id}/confirm',
  summary:
    'Confirma os itens conferidos: inclui, altera e remove eventos da disciplina. Eventos editados pelo aluno não são sobrescritos.',
  tags: ['cronograma'],
  idempotent: true,
  params,
  body: z.object({ items: z.array(ScheduleItem).max(500, 'No máximo 500 itens.') }),
  response: z.object({
    import: ScheduleImportDto,
    result: z.object({
      added: z.number().int(),
      changed: z.number().int(),
      removed: z.number().int(),
      kept: z.number().int(),
    }),
  }),
  errors: ['not_found', 'invalid_request', 'conflict', 'feature_disabled'],
});

export const rejectImport = defineRoute({
  method: 'post',
  path: '/api/v1/schedule-imports/{id}/reject',
  summary: 'Descarta a leitura. Nada muda na agenda.',
  tags: ['cronograma'],
  params,
  response: z.object({ import: ScheduleImportDto }),
  errors: ['not_found', 'conflict', 'feature_disabled'],
});

export const retryImport = defineRoute({
  method: 'post',
  path: '/api/v1/schedule-imports/{id}/retry',
  summary:
    'Lê de novo. Com grantConsent, registra antes a autorização para a IA ler os materiais do aluno.',
  tags: ['cronograma'],
  params,
  body: z.object({ grantConsent: z.boolean().default(false) }),
  response: z.object({ import: ScheduleImportDto }),
  errors: ['not_found', 'conflict', 'feature_disabled'],
});
