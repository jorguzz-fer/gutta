import 'server-only';
import { and, eq, inArray, schema as s, withUser, type Tx } from '@gutta/db';
import type { files as contract } from '@gutta/contracts';
import { emit } from '@gutta/jobs';
import { keys } from '@gutta/storage';
import type { z } from 'zod';
import { conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { requireStorage } from '@/lib/storage';
import { assertFeature, flags } from '@/features/flags/service';
import type { FeatureKey } from '@/features/flags/catalog';

type FileRow = typeof s.files.$inferSelect;
type FileDto = contract.FileDto;

const UPLOAD_TTL = 600;
const READ_TTL = 300;

// Quem pode enviar arquivos: os módulos da v2 que usam arquivo.
const FILE_FEATURES: FeatureKey[] = ['materiais', 'disciplinas', 'aula', 'cadastro'];

export async function assertFilesEnabled() {
  const on = await flags();
  if (!FILE_FEATURES.some((k) => on[k])) await assertFeature(FILE_FEATURES[0]!);
}

export function toDto(f: FileRow): FileDto {
  return {
    id: f.id,
    name: f.originalName,
    mime: f.mime,
    sizeBytes: f.sizeBytes,
    status: f.status,
    kind: (f.kind as FileDto['kind']) ?? null,
    pageCount: f.pageCount,
    hasPdf: f.hasPdf,
    error: f.error,
    downloadable: f.scannedAt !== null && f.status !== 'quarantined',
    createdAt: f.createdAt.toISOString(),
  };
}

async function findOwn(tx: Tx, userId: string, id: string) {
  const f = await tx.query.files.findFirst({
    where: and(eq(s.files.id, id), eq(s.files.ownerId, userId)),
  });
  if (!f) throw notFound('Arquivo');
  return f;
}

async function uploadFor(f: FileRow) {
  const store = requireStorage();
  const { url, headers } = await store.putUrl(keys.original(f.ownerId, f.id), {
    contentType: f.mime,
    contentLength: f.sizeBytes,
    expiresIn: UPLOAD_TTL,
  });
  return {
    url,
    method: 'PUT' as const,
    headers,
    expiresAt: new Date(Date.now() + UPLOAD_TTL * 1000).toISOString(),
  };
}

/**
 * Passo 1 (ADR 0012, 7.4): registra o arquivo e devolve a URL de envio. O mesmo conteúdo do
 * mesmo aluno não sobe duas vezes: devolve o arquivo que já existe.
 */
export async function requestUpload(
  userId: string,
  input: z.output<typeof contract.createUploadBody>,
) {
  await assertFilesEnabled();
  requireStorage();
  const file = await withUser(db(), userId, async (tx) => {
    const existing = await tx.query.files.findFirst({
      where: and(
        eq(s.files.ownerId, userId),
        eq(s.files.sha256, input.sha256),
        inArray(s.files.status, ['uploading', 'scanning', 'processing', 'ready']),
      ),
    });
    if (existing) return { row: existing, duplicate: existing.status !== 'uploading' };
    const [row] = await tx
      .insert(s.files)
      .values({
        ownerId: userId,
        originalName: input.name,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      })
      .returning();
    return { row: row!, duplicate: false };
  });
  return {
    file: toDto(file.row),
    duplicate: file.duplicate,
    upload: file.duplicate ? null : await uploadFor(file.row),
  };
}

/**
 * Passo 3: o navegador terminou o envio. Confere que o objeto chegou com o tamanho declarado
 * e põe o arquivo na fila. Repetir a chamada não repete o efeito.
 */
export async function completeUpload(userId: string, fileId: string, requestId?: string) {
  await assertFilesEnabled();
  const store = requireStorage();
  const f = await withUser(db(), userId, (tx) => findOwn(tx, userId, fileId));
  if (f.status !== 'uploading') return { file: toDto(f) };
  const key = keys.original(userId, fileId);
  const head = await store.head(key);
  if (!head) throw conflict('O arquivo ainda não chegou. Envie de novo.');
  if (head.size !== f.sizeBytes) {
    await store.delete(key);
    const failed = await withUser(db(), userId, async (tx) => {
      const [row] = await tx
        .update(s.files)
        .set({ status: 'failed', error: 'O arquivo chegou com tamanho diferente do informado.' })
        .where(and(eq(s.files.id, fileId), eq(s.files.status, 'uploading')))
        .returning();
      return row ?? (await findOwn(tx, userId, fileId));
    });
    return { file: toDto(failed) };
  }
  const updated = await withUser(db(), userId, async (tx) => {
    const [row] = await tx
      .update(s.files)
      .set({ status: 'scanning' })
      .where(and(eq(s.files.id, fileId), eq(s.files.status, 'uploading')))
      .returning();
    if (row) {
      await emit(
        tx,
        'files.process',
        { fileId, userId, requestId },
        {
          dedupeKey: `file-${fileId}-process`,
        },
      );
      return row;
    }
    // Outra chamada confirmou ao mesmo tempo.
    return findOwn(tx, userId, fileId);
  });
  return { file: toDto(updated) };
}

export async function getFile(userId: string, fileId: string) {
  await assertFilesEnabled();
  const f = await withUser(db(), userId, (tx) => findOwn(tx, userId, fileId));
  return { file: toDto(f) };
}

/** URL assinada de leitura. O original só depois do antivírus; nada de arquivo em quarentena. */
export async function fileUrl(
  userId: string,
  fileId: string,
  q: z.output<typeof contract.fileUrlQuery>,
) {
  await assertFilesEnabled();
  const store = requireStorage();
  const f = await withUser(db(), userId, (tx) => findOwn(tx, userId, fileId));
  if (f.status === 'quarantined') throw conflict('Este arquivo foi bloqueado pelo antivírus.');
  if (!f.scannedAt) throw conflict('O arquivo ainda está sendo verificado.');
  let key: string;
  let contentType: string | undefined;
  let filename: string | undefined = f.originalName;
  if (q.variant === 'original') {
    key = keys.original(userId, fileId);
    contentType = f.mime;
  } else if (q.variant === 'pdf') {
    if (!f.hasPdf) throw notFound('PDF convertido');
    key = keys.pdf(userId, fileId);
    contentType = 'application/pdf';
    filename = f.originalName.replace(/\.[^.]+$/, '') + '.pdf';
  } else {
    const page = q.page ?? 1;
    const p = await withUser(db(), userId, (tx) =>
      tx.query.filePages.findFirst({
        where: and(eq(s.filePages.fileId, fileId), eq(s.filePages.page, page)),
      }),
    );
    if (!p?.hasThumbnail) throw notFound('Miniatura');
    key = keys.thumbnail(userId, fileId, page);
    contentType = 'image/jpeg';
    filename = undefined;
  }
  const url = await store.getUrl(key, {
    filename,
    contentType,
    disposition: q.download ? 'attachment' : 'inline',
    expiresIn: READ_TTL,
  });
  return { url, expiresAt: new Date(Date.now() + READ_TTL * 1000).toISOString() };
}

/** Texto por página, para busca e citação (usado pela biblioteca e pela IA). */
export async function filePages(userId: string, fileId: string) {
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, fileId);
    return tx
      .select({ page: s.filePages.page, text: s.filePages.text })
      .from(s.filePages)
      .where(eq(s.filePages.fileId, fileId))
      .orderBy(s.filePages.page);
  });
}
