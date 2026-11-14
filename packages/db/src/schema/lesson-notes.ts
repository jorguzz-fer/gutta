import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tsvector, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplineTopics, enrolledDisciplines } from './academic';
import { materials, materialVersions } from './materials';
import { lessons } from './schedule';

// Acompanhar Aula (SPEC v2, 5.7 e 8.5; ADR 0015). As marcações e o caderno são do aluno, não do
// arquivo (AUL-25): ficam ligados à versão do material em que foram feitos e o PDF nunca muda.
// Privados por padrão (AUL-28).

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

/** Região de um slide, em coordenadas normalizadas de 0 a 1. */
export type SlideRegion = { x: number; y: number; w: number; h: number };

// Camada de marcações de uma página (AUL-04, AUL-06). O formato das formas é validado pelo
// contrato da API; aqui o banco só guarda o documento.
export const slideAnnotations = pgTable(
  'slide_annotations',
  {
    id: pk(),
    ownerId: ownerRef(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => materialVersions.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    layer: jsonb('layer').$type<unknown[]>().notNull().default([]),
    revision: integer('revision').notNull().default(1),
    // Oculta sem apagar (AUL-06).
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('slide_annotations_page_uq').on(t.versionId, t.page),
    index('slide_annotations_material_idx').on(t.materialId),
    check('slide_annotations_page_ck', sql`${t.page} >= 1`),
  ],
);

// Histórico (AUL-12): a versão substituída num conflito entre aparelhos e uma cópia a cada
// 10 minutos de edição.
export const slideAnnotationHistory = pgTable(
  'slide_annotation_history',
  {
    id: pk(),
    ownerId: ownerRef(),
    annotationId: uuid('annotation_id')
      .notNull()
      .references(() => slideAnnotations.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    layer: jsonb('layer').$type<unknown[]>().notNull(),
    reason: text('reason').notNull().default('copia'),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('slide_annotation_history_idx').on(t.annotationId, t.savedAt)],
);

/** Conteúdo de uma nota do caderno: texto com formatação leve (ADR 0015). */
export type NotebookContent = { text: string };

// O caderno (AUL-08, AUL-10): anotações por aula e slide; a região liga a nota a um trecho.
export const notebookEntries = pgTable(
  'notebook_entries',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    materialId: uuid('material_id').references(() => materials.id, { onDelete: 'set null' }),
    versionId: uuid('version_id').references(() => materialVersions.id, { onDelete: 'set null' }),
    page: integer('page'),
    region: jsonb('region').$type<SlideRegion>(),
    content: jsonb('content').$type<NotebookContent>().notNull(),
    plainText: text('plain_text').notNull().default(''),
    revision: integer('revision').notNull().default(1),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('cognuss_pt'::regconfig, coalesce(plain_text, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('notebook_entries_lesson_idx').on(t.lessonId),
    index('notebook_entries_discipline_idx').on(t.disciplineId, t.createdAt),
    index('notebook_entries_version_idx').on(t.versionId, t.page),
    index('notebook_entries_search_idx').using('gin', t.search),
  ],
);

export const notebookEntryHistory = pgTable(
  'notebook_entry_history',
  {
    id: pk(),
    ownerId: ownerRef(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => notebookEntries.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    content: jsonb('content').$type<NotebookContent>().notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notebook_entry_history_idx').on(t.entryId, t.savedAt)],
);

export const markTarget = pgEnum('mark_target', ['slide', 'regiao', 'anotacao', 'tema']);
export const markImportance = pgEnum('mark_importance', ['nenhuma', 'importante', 'alta']);
export const markDifficulty = pgEnum('mark_difficulty', ['facil', 'moderado', 'dificil']);

// Selos e dúvidas (AUL-13 a AUL-16). Importância e dificuldade são independentes.
export const contentMarks = pgTable(
  'content_marks',
  {
    id: pk(),
    ownerId: ownerRef(),
    targetType: markTarget('target_type').notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    materialId: uuid('material_id').references(() => materials.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => materialVersions.id, { onDelete: 'cascade' }),
    page: integer('page'),
    region: jsonb('region').$type<SlideRegion>(),
    entryId: uuid('entry_id').references(() => notebookEntries.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => disciplineTopics.id, { onDelete: 'cascade' }),
    importance: markImportance('importance').notNull().default('nenhuma'),
    difficulty: markDifficulty('difficulty'),
    // Dúvida com texto opcional: string vazia é "tenho dúvida" sem texto; nulo é sem dúvida.
    doubt: text('doubt'),
    doubtResolvedAt: timestamp('doubt_resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Um selo por slide inteiro; trechos podem ter vários.
    uniqueIndex('content_marks_slide_uq')
      .on(t.versionId, t.page)
      .where(sql`${t.targetType} = 'slide'`),
    index('content_marks_lesson_idx').on(t.lessonId),
    index('content_marks_material_idx').on(t.materialId),
    check(
      'content_marks_target_ck',
      sql`(${t.targetType} = 'slide' AND ${t.versionId} IS NOT NULL AND ${t.page} IS NOT NULL)
        OR (${t.targetType} = 'regiao' AND ${t.versionId} IS NOT NULL AND ${t.page} IS NOT NULL AND ${t.region} IS NOT NULL)
        OR (${t.targetType} = 'anotacao' AND ${t.entryId} IS NOT NULL)
        OR (${t.targetType} = 'tema' AND ${t.topicId} IS NOT NULL)`,
    ),
  ],
);

export const lessonDifficulty = pgEnum('lesson_difficulty', ['facil', 'moderada', 'dificil']);

// Concluir aula (AUL-18) e presença (AUL-30): rápido e opcional, nunca uma prova. Guarda também
// onde o aluno parou, para continuar em outro aparelho (AUL-26).
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: pk(),
    ownerId: ownerRef(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    attended: boolean('attended'),
    overallDifficulty: lessonDifficulty('overall_difficulty'),
    understoodGoals: boolean('understood_goals').notNull().default(false),
    hasDoubts: boolean('has_doubts').notNull().default(false),
    wantsReview: boolean('wants_review').notNull().default(false),
    concludedAt: timestamp('concluded_at', { withTimezone: true }),
    lastMaterialId: uuid('last_material_id').references(() => materials.id, {
      onDelete: 'set null',
    }),
    lastPage: integer('last_page'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('lesson_progress_lesson_uq').on(t.lessonId)],
);
