import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './_shared';
import { authUsers } from './auth';

// Arquivos enviados pelo aluno (ADR 0012; SPEC v2, 7.4). O conteúdo fica no bucket, na chave
// u/{owner_id}/f/{id}/…; aqui ficam os metadados, o estado do processamento e o texto por
// página. Tudo privado do dono (RLS).
export const fileStatus = pgEnum('file_status', [
  'uploading', // URL de envio emitida, esperando o navegador confirmar
  'scanning', // na fila: antivírus e conferência do tipo
  'processing', // convertendo, extraindo texto e miniaturas
  'ready',
  'failed', // não processou; o original continua disponível
  'quarantined', // infectado: apagado do bucket
]);

export const files = pgTable(
  'files',
  {
    id: pk(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    originalName: text('original_name').notNull(),
    // Tipo declarado pelo navegador; o worker confere pelo conteúdo.
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    // Resumo informado pelo navegador; o worker recalcula e recusa se não bater.
    sha256: text('sha256').notNull(),
    status: fileStatus('status').notNull().default('uploading'),
    // Família detectada pelo conteúdo: pdf, office, sheet, image.
    kind: text('kind'),
    pageCount: integer('page_count'),
    hasPdf: boolean('has_pdf').notNull().default(false),
    error: text('error'),
    // Só depois do antivírus o original pode ser baixado.
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('files_owner_idx').on(t.ownerId, t.createdAt),
    // Deduplicação só dentro do mesmo aluno: entre alunos revelaria quem tem o mesmo arquivo.
    uniqueIndex('files_owner_sha_uq')
      .on(t.ownerId, t.sha256)
      .where(sql`${t.status} not in ('failed', 'quarantined')`),
    check('files_size_ck', sql`${t.sizeBytes} > 0`),
    check('files_sha_ck', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const filePages = pgTable(
  'file_pages',
  {
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    text: text('text').notNull().default(''),
    hasThumbnail: boolean('has_thumbnail').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.page] }), index('file_pages_owner_idx').on(t.ownerId)],
);
