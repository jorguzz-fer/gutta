import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';
import { FileDto } from './files';
import { MaterialOrigin, MaterialType } from './materials';

// Acompanhar Aula (SPEC v2, 5.7; ADR 0015). Marcações por página, caderno, selos, dúvidas e
// conclusão da aula. Tudo privado do aluno (AUL-28).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unit = z.number().min(-0.5).max(1.5);
const size = z.number().min(0).max(2);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #rrggbb.');
const width = z.number().min(0.0005).max(0.1);
const shapeId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** Ponto de um traço: x e y de 0 a 1 em relação à página, e a pressão de 0 a 1. */
export const Point = z.tuple([unit, unit, z.number().min(0).max(1)]);

// Formas da camada de marcações (AUL-04). Coordenadas normalizadas (ADR 0015).
export const Shape = z.discriminatedUnion('kind', [
  z.object({
    id: shapeId,
    kind: z.enum(['pen', 'marker']),
    color,
    width,
    points: z.array(Point).min(1).max(5000),
  }),
  z.object({
    id: shapeId,
    kind: z.enum(['line', 'arrow']),
    color,
    width,
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
  }),
  z.object({
    id: shapeId,
    kind: z.enum(['rect', 'ellipse']),
    color,
    width,
    x: unit,
    y: unit,
    w: size,
    h: size,
  }),
  z.object({
    id: shapeId,
    kind: z.literal('text'),
    color,
    size: z.number().min(0.005).max(0.2),
    x: unit,
    y: unit,
    text: z.string().min(1).max(2000),
  }),
  z.object({
    id: shapeId,
    kind: z.literal('image'),
    x: unit,
    y: unit,
    w: size,
    h: size,
    fileId: Uuid,
  }),
]);
export type Shape = z.infer<typeof Shape>;

export const Layer = z
  .array(Shape)
  .max(2000, 'Muitas marcações nesta página.')
  .refine((l) => JSON.stringify(l).length <= 1_000_000, 'Marcações grandes demais nesta página.');

export const Region = z.object({ x: unit, y: unit, w: size, h: size });

export const Importance = z.enum(['nenhuma', 'importante', 'alta']);
export const Difficulty = z.enum(['facil', 'moderado', 'dificil']);
export const LessonDifficulty = z.enum(['facil', 'moderada', 'dificil']);

export const AnnotationDto = z.object({
  page: z.number().int(),
  versionId: Uuid,
  layer: Layer,
  revision: z.number().int(),
  hidden: z.boolean(),
  updatedAt: z.string(),
});
export type AnnotationDto = z.infer<typeof AnnotationDto>;

export const NoteDto = z.object({
  id: Uuid,
  disciplineId: Uuid,
  lessonId: Uuid.nullable(),
  lessonTitle: z.string().nullable(),
  lessonDate: day.nullable(),
  materialId: Uuid.nullable(),
  materialTitle: z.string().nullable(),
  versionId: Uuid.nullable(),
  page: z.number().int().nullable(),
  region: Region.nullable(),
  text: z.string(),
  revision: z.number().int(),
  /** Importância do slide de origem, para o caderno da disciplina (AUL-23). */
  importance: Importance.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoteDto = z.infer<typeof NoteDto>;

export const MarkDto = z.object({
  id: Uuid,
  targetType: z.enum(['slide', 'regiao', 'anotacao', 'tema']),
  lessonId: Uuid.nullable(),
  materialId: Uuid.nullable(),
  versionId: Uuid.nullable(),
  page: z.number().int().nullable(),
  region: Region.nullable(),
  entryId: Uuid.nullable(),
  topicId: Uuid.nullable(),
  importance: Importance,
  difficulty: Difficulty.nullable(),
  doubt: z.string().nullable(),
  doubtResolved: z.boolean(),
  /** Prioridade na revisão (AUL-21). */
  priority: z.number(),
});
export type MarkDto = z.infer<typeof MarkDto>;

export const ProgressDto = z.object({
  attended: z.boolean().nullable(),
  overallDifficulty: LessonDifficulty.nullable(),
  understoodGoals: z.boolean(),
  hasDoubts: z.boolean(),
  wantsReview: z.boolean(),
  concludedAt: z.string().nullable(),
  lastMaterialId: Uuid.nullable(),
  lastPage: z.number().int().nullable(),
});
export type ProgressDto = z.infer<typeof ProgressDto>;

export const StudyMaterialDto = z.object({
  id: Uuid,
  title: z.string(),
  type: MaterialType,
  origin: MaterialOrigin,
  version: z.number().int(),
  versionId: Uuid,
  file: FileDto,
  /** Há marcações ou notas numa versão anterior, esperando reassociação (AUL-25). */
  olderAnnotations: z.boolean(),
});
export type StudyMaterialDto = z.infer<typeof StudyMaterialDto>;

export const LessonStudyDto = z.object({
  lesson: z.object({
    id: Uuid,
    title: z.string(),
    date: day,
    start: z.string().nullable(),
    end: z.string().nullable(),
    disciplineId: Uuid,
    disciplineName: z.string(),
    topic: z.string().nullable(),
    teachers: z.array(z.string()),
    location: z.string().nullable(),
    /** Antes, durante ou depois da aula (SPEC v2, 5.7). */
    moment: z.enum(['antes', 'durante', 'depois']),
  }),
  materials: z.array(StudyMaterialDto),
  notes: z.array(NoteDto),
  marks: z.array(MarkDto),
  progress: ProgressDto,
});
export type LessonStudyDto = z.infer<typeof LessonStudyDto>;

const lessonParams = z.object({ id: Uuid });
const materialParams = z.object({ id: Uuid });

export const getLessonStudy = defineRoute({
  method: 'get',
  path: '/api/v1/lessons/{id}/study',
  summary: 'Página da aula (AUL-01): aula, materiais, caderno, selos e progresso.',
  tags: ['aula'],
  params: lessonParams,
  response: LessonStudyDto,
  errors: ['feature_disabled', 'not_found'],
});

export const listAnnotations = defineRoute({
  method: 'get',
  path: '/api/v1/materials/{id}/annotations',
  summary: 'Marcações de todas as páginas de uma versão do material.',
  tags: ['aula'],
  params: materialParams,
  query: z.object({ versionId: Uuid }),
  response: z.object({ items: z.array(AnnotationDto) }),
  errors: ['feature_disabled', 'not_found'],
});

export const saveAnnotation = defineRoute({
  method: 'put',
  path: '/api/v1/materials/{id}/annotations/{page}',
  summary:
    'Grava a camada de uma página (AUL-07). Vence a última gravação; a substituída vai para o histórico.',
  tags: ['aula'],
  idempotent: true,
  params: z.object({ id: Uuid, page: z.coerce.number().int().min(1).max(5000) }),
  body: z.object({
    versionId: Uuid,
    /** Revisão em que o aparelho se baseou; 0 para página ainda sem marcações. */
    baseRevision: z.number().int().min(0),
    layer: Layer,
    hidden: z.boolean().optional(),
  }),
  response: AnnotationDto.extend({ conflict: z.boolean() }),
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const annotationHistory = defineRoute({
  method: 'get',
  path: '/api/v1/materials/{id}/annotations/{page}/history',
  summary: 'Histórico das marcações de uma página (AUL-12).',
  tags: ['aula'],
  params: z.object({ id: Uuid, page: z.coerce.number().int().min(1) }),
  query: z.object({ versionId: Uuid }),
  response: z.object({
    items: z.array(
      z.object({
        id: Uuid,
        revision: z.number().int(),
        reason: z.string(),
        shapes: z.number().int(),
        savedAt: z.string(),
      }),
    ),
  }),
  errors: ['feature_disabled', 'not_found'],
});

export const restoreAnnotation = defineRoute({
  method: 'post',
  path: '/api/v1/annotation-history/{id}/restore',
  summary: 'Recupera uma versão do histórico; a atual vai para o histórico.',
  tags: ['aula'],
  params: z.object({ id: Uuid }),
  response: AnnotationDto,
  errors: ['feature_disabled', 'not_found'],
});

export const reassociation = defineRoute({
  method: 'get',
  path: '/api/v1/materials/{id}/reassociation',
  summary: 'Sugestão de pares de páginas entre a versão anterior com marcações e a atual (AUL-25).',
  tags: ['aula'],
  params: materialParams,
  response: z.object({
    fromVersionId: Uuid.nullable(),
    fromVersion: z.number().int().nullable(),
    toVersionId: Uuid,
    toVersion: z.number().int(),
    pages: z.array(
      z.object({
        from: z.number().int(),
        to: z.number().int().nullable(),
        score: z.number(),
        shapes: z.number().int(),
        notes: z.number().int(),
        marks: z.number().int(),
      }),
    ),
  }),
  errors: ['feature_disabled', 'not_found'],
});

export const applyReassociation = defineRoute({
  method: 'post',
  path: '/api/v1/materials/{id}/reassociation',
  summary: 'Leva marcações, notas e selos para a versão atual, nos pares confirmados pelo aluno.',
  tags: ['aula'],
  params: materialParams,
  body: z.object({
    fromVersionId: Uuid,
    pairs: z
      .array(z.object({ from: z.number().int().min(1), to: z.number().int().min(1) }))
      .max(5000),
  }),
  response: z.object({ moved: z.number().int() }),
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

const noteText = z.string().max(20_000, 'Nota longa demais.');

export const listNotes = defineRoute({
  method: 'get',
  path: '/api/v1/notebook',
  summary:
    'Caderno (AUL-23): notas de uma aula ou da disciplina inteira, com busca por palavra (AUL-11).',
  tags: ['aula'],
  query: z.object({
    lessonId: Uuid.optional(),
    disciplineId: Uuid.optional(),
    q: z.string().trim().max(200).optional(),
  }),
  response: z.object({ items: z.array(NoteDto) }),
  errors: ['feature_disabled', 'not_found'],
});

export const createNote = defineRoute({
  method: 'post',
  path: '/api/v1/notebook',
  summary: 'Nova nota no caderno, ligada à aula e, se quiser, a um slide e a uma região (AUL-10).',
  tags: ['aula'],
  idempotent: true,
  body: z.object({
    lessonId: Uuid.nullable().optional().default(null),
    disciplineId: Uuid.nullable().optional().default(null),
    materialId: Uuid.nullable().optional().default(null),
    versionId: Uuid.nullable().optional().default(null),
    page: z.number().int().min(1).nullable().optional().default(null),
    region: Region.nullable().optional().default(null),
    text: noteText,
  }),
  response: NoteDto,
  status: 201,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const updateNote = defineRoute({
  method: 'patch',
  path: '/api/v1/notebook/{id}',
  summary: 'Atualiza o texto de uma nota; a versão anterior vai para o histórico.',
  tags: ['aula'],
  idempotent: true,
  params: z.object({ id: Uuid }),
  body: z.object({ text: noteText, baseRevision: z.number().int().min(1) }),
  response: NoteDto.extend({ conflict: z.boolean() }),
  errors: ['feature_disabled', 'not_found'],
});

export const deleteNote = defineRoute({
  method: 'delete',
  path: '/api/v1/notebook/{id}',
  summary: 'Apaga uma nota do caderno.',
  tags: ['aula'],
  params: z.object({ id: Uuid }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['feature_disabled', 'not_found'],
});

export const markBody = z
  .object({
    targetType: z.enum(['slide', 'regiao', 'tema']),
    lessonId: Uuid.nullable().optional().default(null),
    materialId: Uuid.nullable().optional().default(null),
    versionId: Uuid.nullable().optional().default(null),
    page: z.number().int().min(1).nullable().optional().default(null),
    region: Region.nullable().optional().default(null),
    topicId: Uuid.nullable().optional().default(null),
    importance: Importance.optional(),
    difficulty: Difficulty.nullable().optional(),
    /** Nulo tira a dúvida; texto vazio marca dúvida sem texto (AUL-16). */
    doubt: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (b) =>
      b.targetType === 'tema'
        ? Boolean(b.topicId)
        : Boolean(b.materialId && b.versionId && b.page && (b.targetType === 'slide' || b.region)),
    'Informe o slide (e a região) ou o tema.',
  );

export const saveMark = defineRoute({
  method: 'post',
  path: '/api/v1/marks',
  summary:
    'Selo de importância e dificuldade e dúvida (AUL-13 a AUL-16). Slide inteiro: um só, atualizado.',
  tags: ['aula'],
  idempotent: true,
  body: markBody,
  response: MarkDto,
  errors: ['feature_disabled', 'not_found', 'invalid_request'],
});

export const updateMark = defineRoute({
  method: 'patch',
  path: '/api/v1/marks/{id}',
  summary: 'Muda o selo ou a dúvida; marca a dúvida como resolvida.',
  tags: ['aula'],
  params: z.object({ id: Uuid }),
  body: z.object({
    importance: Importance.optional(),
    difficulty: Difficulty.nullable().optional(),
    doubt: z.string().trim().max(2000).nullable().optional(),
    doubtResolved: z.boolean().optional(),
  }),
  response: MarkDto,
  errors: ['feature_disabled', 'not_found'],
});

export const deleteMark = defineRoute({
  method: 'delete',
  path: '/api/v1/marks/{id}',
  summary: 'Tira o selo de um trecho.',
  tags: ['aula'],
  params: z.object({ id: Uuid }),
  response: z.object({ ok: z.literal(true) }),
  errors: ['feature_disabled', 'not_found'],
});

export const saveProgress = defineRoute({
  method: 'put',
  path: '/api/v1/lessons/{id}/progress',
  summary:
    'Presença (AUL-30), onde parou (AUL-26) e concluir aula (AUL-18): rápido e opcional, nunca uma prova.',
  tags: ['aula'],
  idempotent: true,
  params: lessonParams,
  body: z.object({
    attended: z.boolean().nullable().optional(),
    overallDifficulty: LessonDifficulty.nullable().optional(),
    understoodGoals: z.boolean().optional(),
    hasDoubts: z.boolean().optional(),
    wantsReview: z.boolean().optional(),
    /** true conclui; false reabre. */
    concluded: z.boolean().optional(),
    lastMaterialId: Uuid.nullable().optional(),
    lastPage: z.number().int().min(1).nullable().optional(),
  }),
  response: ProgressDto,
  errors: ['feature_disabled', 'not_found'],
});
