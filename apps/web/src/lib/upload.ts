'use client';
import type { z } from 'zod';
import type { files } from '@gutta/contracts';
import { api, ClientApiError } from './client-api';

type CreateUpload = z.output<typeof files.createUpload.response>;
type FileResponse = z.output<typeof files.getFile.response>;
export type UploadedFile = FileResponse['file'];

export type UploadProgress =
  | { stage: 'hashing' }
  | { stage: 'uploading'; loaded: number; total: number }
  | { stage: 'processing'; file: UploadedFile }
  | { stage: 'done'; file: UploadedFile };

async function sha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function put(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (n: number) => void,
) {
  // XMLHttpRequest porque o fetch ainda não informa o progresso do envio.
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ClientApiError(xhr.status, 'upload_failed', 'O envio falhou. Tente de novo.'));
    xhr.onerror = () =>
      reject(new ClientApiError(0, 'network', 'Sem conexão. Confira a internet e tente de novo.'));
    xhr.send(body);
  });
}

const FINAL = new Set(['ready', 'failed', 'quarantined']);

/**
 * Envia um arquivo pelo caminho do ADR 0012: resumo SHA-256 no navegador, pedido da URL,
 * envio direto ao bucket, confirmação e acompanhamento do processamento até o fim.
 */
export async function uploadFile(
  file: File,
  onProgress: (p: UploadProgress) => void = () => {},
  opts: { pollMs?: number; signal?: AbortSignal } = {},
): Promise<UploadedFile> {
  onProgress({ stage: 'hashing' });
  const created = await api<CreateUpload>('/files', {
    method: 'POST',
    body: { name: file.name, mime: file.type, sizeBytes: file.size, sha256: await sha256(file) },
    signal: opts.signal,
  });
  let current: UploadedFile = created.file;
  if (created.upload) {
    await put(created.upload.url, created.upload.headers, file, (loaded) =>
      onProgress({ stage: 'uploading', loaded, total: file.size }),
    );
    current = (await api<FileResponse>(`/files/${current.id}/complete`, { method: 'POST' })).file;
  }
  while (!FINAL.has(current.status)) {
    onProgress({ stage: 'processing', file: current });
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 1500));
    if (opts.signal?.aborted) throw new ClientApiError(0, 'aborted', 'Envio cancelado.');
    current = (await api<FileResponse>(`/files/${current.id}`, { signal: opts.signal })).file;
  }
  onProgress({ stage: 'done', file: current });
  return current;
}
