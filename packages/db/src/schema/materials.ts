import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tsvector, updatedAt } from './_shared';
import { authUsers } from './auth';
import {
  disciplineTeachers,
  disciplineTopics,
  enrolledDisciplines,
  studentTerms,
} from './academic';
import { files } from './files';
import { lessons } from './schedule';

// Material de estudo (SPEC v2, 5.10 e 8.4). Um repositório só: o material é a unidade lógica,
// com versões (cada uma aponta para um arquivo) e vínculos (disciplina, aula, tema, docente).
// O mesmo material aparece em várias aulas sem cópia (MAT-15). Privado por padrão (MAT-17).

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const materialType = pgEnum('material_type', ['estudo', 'atividade', 'prova']);
// Procedência sempre visível (SPEC v2, 6.3; MAT-19).
export const materialOrigin = pgEnum('material_origin', [
  'professor',
  'pessoal',
  'colega',
  'cognuss',
  'internet',
]);

export const materials = pgTable(
  'materials',
  {
    id: pk(),
    ownerId: ownerRef(),
    title: text('title').notNull(),
    type: materialType('type').notNull().default('estudo'),
    origin: materialOrigin('origin').notNull().default('professor'),
    termId: uuid('term_id').references(() => studentTerms.id, { onDelete: 'set null' }),
    favorite: boolean('favorite').notNull().default(false),
    // Lixeira (MAT-21): recuperável por 30 dias.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Busca por palavra no título (ADR 0014), em português e sem acento.
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('cognuss_pt'::regconfig, coalesce(title, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('materials_owner_idx').on(t.ownerId, t.createdAt),
    index('materials_search_idx').using('gin', t.search),
  ],
);

export const materialVersions = pgTable(
  'material_versions',
  {
    id: pk(),
    ownerId: ownerRef(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('material_versions_uq').on(t.materialId, t.version)],
);

export const materialLinks = pgTable(
  'material_links',
  {
    id: pk(),
    ownerId: ownerRef(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    disciplineId: uuid('discipline_id').references(() => enrolledDisciplines.id, {
      onDelete: 'cascade',
    }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id').references(() => disciplineTopics.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => disciplineTeachers.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('material_links_material_idx').on(t.materialId),
    index('material_links_lesson_idx').on(t.lessonId),
    index('material_links_discipline_idx').on(t.disciplineId),
  ],
);

// Busca por conceito (ADR 0014; SPEC v2, MAT-09). Trechos da versão atual de cada material,
// com as páginas de origem e o vetor da Voyage AI (decisão do Fernando, 14/11/2026). Gerados
// pelo worker só para quem autorizou a leitura pela IA com o texto que cita a Voyage.
export const EMBEDDING_DIMENSIONS = 1024;
export const materialChunks = pgTable(
  'material_chunks',
  {
    id: pk(),
    ownerId: ownerRef(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => materialVersions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    pageFrom: integer('page_from').notNull(),
    pageTo: integer('page_to').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('material_chunks_version_pos_uq').on(t.versionId, t.position),
    index('material_chunks_owner_idx').on(t.ownerId),
    index('material_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);
