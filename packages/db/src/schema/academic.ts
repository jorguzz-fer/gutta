import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';
import { disciplines, topics } from './catalog';
import { files } from './files';

// Vida acadêmica do aluno (SPEC v2, 8.1): as disciplinas que ele cursa, com os docentes e os
// temas dele. Diferente do catálogo editorial (disciplines), que é igual para todos: a
// disciplina do aluno pode apontar para uma do catálogo, para o material complementar.

const ownerRef = () =>
  text('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });

export const studentTerms = pgTable(
  'student_terms',
  {
    id: pk(),
    ownerId: ownerRef(),
    label: text('label').notNull(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('student_terms_owner_idx').on(t.ownerId),
    // Um semestre atual por aluno.
    uniqueIndex('student_terms_current_uq')
      .on(t.ownerId)
      .where(sql`${t.isCurrent}`),
    check(
      'student_terms_dates_ck',
      sql`${t.startsOn} is null or ${t.endsOn} is null or ${t.startsOn} <= ${t.endsOn}`,
    ),
  ],
);

export const enrolledDisciplines = pgTable(
  'enrolled_disciplines',
  {
    id: pk(),
    ownerId: ownerRef(),
    termId: uuid('term_id')
      .notNull()
      .references(() => studentTerms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    shortName: text('short_name'),
    // Cor de categoria 1 a 8 (tokens.css, --cat-N).
    color: smallint('color').notNull().default(6),
    icon: text('icon'),
    catalogDisciplineId: uuid('catalog_discipline_id').references(() => disciplines.id, {
      onDelete: 'set null',
    }),
    workloadHours: smallint('workload_hours'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('enrolled_disciplines_owner_idx').on(t.ownerId, t.termId),
    uniqueIndex('enrolled_disciplines_name_uq')
      .on(t.termId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('enrolled_disciplines_color_ck', sql`${t.color} between 1 and 8`),
    check(
      'enrolled_disciplines_workload_ck',
      sql`${t.workloadHours} is null or ${t.workloadHours} between 1 and 2000`,
    ),
  ],
);

export const disciplineTeachers = pgTable(
  'discipline_teachers',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('discipline_teachers_name_uq').on(t.disciplineId, sql`lower(${t.name})`),
    index('discipline_teachers_owner_idx').on(t.ownerId),
  ],
);

export const disciplineTopics = pgTable(
  'discipline_topics',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: smallint('order_index').notNull().default(0),
    catalogTopicId: uuid('catalog_topic_id').references(() => topics.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('discipline_topics_name_uq').on(t.disciplineId, sql`lower(${t.name})`),
    index('discipline_topics_owner_idx').on(t.ownerId),
  ],
);

// Documentos da disciplina (SPEC v2, DIS-02 e DIS-03): o cronograma e o plano de ensino enviados
// pelo aluno. O arquivo é o mesmo do caminho de arquivos (ADR 0012); aqui fica só o vínculo.
// A leitura do cronograma pela IA (DIS-05) usa esse vínculo.
export const disciplineDocumentKind = pgEnum('discipline_document_kind', [
  'cronograma',
  'plano_ensino',
]);

export const disciplineDocuments = pgTable(
  'discipline_documents',
  {
    id: pk(),
    ownerId: ownerRef(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => enrolledDisciplines.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    kind: disciplineDocumentKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('discipline_documents_file_uq').on(t.disciplineId, t.kind, t.fileId),
    index('discipline_documents_owner_idx').on(t.ownerId),
  ],
);
