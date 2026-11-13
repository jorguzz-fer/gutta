import { z } from 'zod';
import { Uuid } from '../common';
import { defineRoute } from '../registry';

// Arquivos (ADR 0012; SPEC v2, 7.4). O navegador pede a URL de envio, manda o arquivo direto
// ao bucket e confirma. O worker varre, converte e extrai texto e miniaturas por página.

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const FileStatus = z.enum([
  'uploading',
  'scanning',
  'processing',
  'ready',
  'failed',
  'quarantined',
]);

export const FileDto = z.object({
  id: Uuid,
  name: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  status: FileStatus,
  kind: z.enum(['pdf', 'office', 'sheet', 'image']).nullable(),
  pageCount: z.number().int().nullable(),
  hasPdf: z.boolean(),
  /** Motivo legível quando o processamento falhou. */
  error: z.string().nullable(),
  /** O original só pode ser baixado depois do antivírus. */
  downloadable: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type FileDto = z.infer<typeof FileDto>;

export const createUploadBody = z.object({
  name: z.string().trim().min(1, 'Informe o nome do arquivo.').max(200),
  mime: z.enum(ALLOWED_MIME, { error: 'Tipo de arquivo não aceito.' }),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES, 'O arquivo passa de 50 MB.'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'Resumo SHA-256 inválido.'),
});

export const createUpload = defineRoute({
  method: 'post',
  path: '/api/v1/files',
  summary:
    'Pede a URL para enviar um arquivo direto ao bucket. Se o aluno já tem o mesmo arquivo, devolve o existente e não pede envio.',
  tags: ['arquivos'],
  idempotent: true,
  body: createUploadBody,
  response: z.object({
    file: FileDto,
    duplicate: z.boolean(),
    upload: z
      .object({
        url: z.string(),
        method: z.literal('PUT'),
        headers: z.record(z.string(), z.string()),
        expiresAt: z.iso.datetime(),
      })
      .nullable(),
  }),
  status: 201,
  errors: ['feature_disabled', 'unavailable'],
});

const fileParams = z.object({ id: Uuid });

export const completeUpload = defineRoute({
  method: 'post',
  path: '/api/v1/files/{id}/complete',
  summary: 'Confirma que o envio terminou. O arquivo entra na fila de processamento.',
  tags: ['arquivos'],
  idempotent: true,
  params: fileParams,
  response: z.object({ file: FileDto }),
  errors: ['not_found', 'conflict', 'feature_disabled', 'unavailable'],
});

export const getFile = defineRoute({
  method: 'get',
  path: '/api/v1/files/{id}',
  summary: 'Estado do arquivo e do processamento.',
  tags: ['arquivos'],
  params: fileParams,
  response: z.object({ file: FileDto }),
  errors: ['not_found', 'feature_disabled'],
});

export const fileUrlQuery = z.object({
  variant: z.enum(['original', 'pdf', 'thumbnail']).default('original'),
  page: z.coerce.number().int().min(1).optional(),
  download: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
});

export const fileUrl = defineRoute({
  method: 'get',
  path: '/api/v1/files/{id}/url',
  summary:
    'URL assinada de vida curta para ver ou baixar o original, o PDF convertido ou a miniatura de uma página.',
  tags: ['arquivos'],
  params: fileParams,
  query: fileUrlQuery,
  response: z.object({ url: z.string(), expiresAt: z.iso.datetime() }),
  errors: ['not_found', 'conflict', 'feature_disabled', 'unavailable'],
});
