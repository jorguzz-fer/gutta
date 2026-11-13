import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';
import { FileDto } from './files';

// Material de estudo (SPEC v2, 5.10). Um repositório único: o material tem versões (arquivos)
// e vínculos (disciplina, aula, tema, docente). Privado por padrão.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MaterialType = z.enum(['estudo', 'atividade', 'prova']);
export const MaterialOrigin = z.enum(['professor', 'pessoal', 'colega', 'cognuss', 'internet']);
const name = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((v) => v || null);

export const MaterialDto = z.object({
  id: Uuid,
  title: z.string(),
  type: MaterialType,
  origin: MaterialOrigin,
  favorite: z.boolean(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  termId: Uuid.nullable(),
  /** Versão atual e o histórico (MAT-16). */
  version: z.number().int(),
  file: FileDto,
  versions: z.array(z.object({ version: z.number().int(), file: FileDto, createdAt: z.string() })),
  links: z.array(
    z.object({
      id: Uuid,
      disciplineId: Uuid.nullable(),
      disciplineName: z.string().nullable(),
      lessonId: Uuid.nullable(),
      lessonTitle: z.string().nullable(),
      lessonDate: day.nullable(),
      topic: z.string().nullable(),
      teacher: z.string().nullable(),
    }),
  ),
});
export type MaterialDto = z.infer<typeof MaterialDto>;

export const materialBody = z.object({
  fileId: Uuid,
  title: z.string().trim().min(1, 'Informe o título.').max(200),
  type: MaterialType,
  origin: MaterialOrigin.default('professor'),
  disciplineId: Uuid,
  lessonId: Uuid.nullable().optional().default(null),
  topic: name,
  teacher: name,
  /** Semestre anterior (MAT-04); sem ele, o atual. */
  termId: Uuid.nullable().optional().default(null),
});

export const Tab = z.enum(['atual', 'anteriores', 'biblioteca', 'favoritos', 'lixeira']);

export const listMaterials = defineRoute({
  method: 'get',
  path: '/api/v1/materials',
  summary: 'Materiais por aba (MAT-01), com filtro de disciplina e tipo.',
  tags: ['materiais'],
  query: z.object({
    tab: Tab.default('atual'),
    disciplineId: Uuid.optional(),
    type: MaterialType.optional(),
  }),
  response: z.object({ items: z.array(MaterialDto) }),
  errors: ['feature_disabled'],
});

export const createMaterial = defineRoute({
  method: 'post',
  path: '/api/v1/materials',
  summary:
    'Anexa um arquivo já enviado como material (MAT-04, MAT-07): tipo, título, disciplina; aula, tema e docente são opcionais.',
  tags: ['materiais'],
  body: materialBody,
  response: z.object({ material: MaterialDto }),
  status: 201,
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

const params = z.object({ id: Uuid });

export const updateMaterial = defineRoute({
  method: 'patch',
  path: '/api/v1/materials/{id}',
  summary: 'Muda título, tipo, origem ou favorito.',
  tags: ['materiais'],
  params,
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    type: MaterialType.optional(),
    origin: MaterialOrigin.optional(),
    favorite: z.boolean().optional(),
  }),
  response: z.object({ material: MaterialDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const addVersion = defineRoute({
  method: 'post',
  path: '/api/v1/materials/{id}/versions',
  summary: 'Substitui o arquivo guardando as versões anteriores (MAT-16).',
  tags: ['materiais'],
  params,
  body: z.object({ fileId: Uuid }),
  response: z.object({ material: MaterialDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const linkMaterial = defineRoute({
  method: 'post',
  path: '/api/v1/materials/{id}/links',
  summary: 'Liga o material a outra aula ou tema, sem cópia (MAT-15).',
  tags: ['materiais'],
  params,
  body: z.object({
    disciplineId: Uuid,
    lessonId: Uuid.nullable().optional().default(null),
    topic: name,
    teacher: name,
  }),
  response: z.object({ material: MaterialDto }),
  errors: ['invalid_request', 'not_found', 'feature_disabled'],
});

export const trashMaterial = defineRoute({
  method: 'delete',
  path: '/api/v1/materials/{id}',
  summary: 'Manda para a lixeira; dá para recuperar por 30 dias (MAT-21).',
  tags: ['materiais'],
  params,
  response: z.object({ ok: z.literal(true) }),
  errors: ['not_found', 'feature_disabled'],
});

export const restoreMaterial = defineRoute({
  method: 'post',
  path: '/api/v1/materials/{id}/restore',
  summary: 'Tira da lixeira.',
  tags: ['materiais'],
  params,
  response: z.object({ material: MaterialDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const LessonContentDto = z.object({
  lessonId: Uuid,
  date: day,
  time: z.string().nullable(),
  title: z.string(),
  topic: z.string().nullable(),
  teacher: z.string().nullable(),
  materials: z.array(
    z.object({
      id: Uuid,
      title: z.string(),
      type: MaterialType,
      origin: MaterialOrigin,
      file: FileDto,
    }),
  ),
});

export const lessonContent = defineRoute({
  method: 'get',
  path: '/api/v1/disciplines/{id}/lesson-content',
  summary:
    'Conteúdo de aula (MAT-02, MAT-03): as aulas do cronograma, em ordem, com os materiais de cada uma.',
  tags: ['materiais'],
  params,
  response: z.object({
    disciplineName: z.string(),
    lessons: z.array(LessonContentDto),
    /** Materiais da disciplina sem aula. */
    loose: z.array(MaterialDto),
  }),
  errors: ['not_found', 'feature_disabled'],
});

export const SearchHitDto = z.object({
  kind: z.enum(['material', 'pagina', 'lembrete']),
  materialId: Uuid.nullable(),
  title: z.string(),
  /** Trecho com o termo; as palavras encontradas vêm entre « e ». */
  snippet: z.string().nullable(),
  page: z.number().int().nullable(),
  disciplineName: z.string().nullable(),
  type: MaterialType.nullable(),
  link: z.string(),
});

export const search = defineRoute({
  method: 'get',
  path: '/api/v1/search',
  summary:
    'Busca por palavra no título e no conteúdo dos materiais e nos lembretes do aluno (MAT-09; ADR 0014), sem acento.',
  tags: ['materiais'],
  query: z.object({
    q: z.string().trim().min(2, 'Digite pelo menos duas letras.').max(200),
    disciplineId: Uuid.optional(),
    type: MaterialType.optional(),
  }),
  response: z.object({ items: z.array(SearchHitDto) }),
  errors: ['invalid_request', 'feature_disabled'],
});
