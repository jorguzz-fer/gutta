// Armazenamento de objetos (ADR 0012). Duas implementações: S3 (Cloudflare R2 em produção,
// ou qualquer serviço compatível) e memória (testes). O código não usa recurso exclusivo do
// R2, para a troca de provedor ser só configuração.

export type PutUrlOptions = {
  contentType: string;
  contentLength: number;
  /** Segundos. */
  expiresIn: number;
};

export type GetUrlOptions = {
  /** Nome sugerido no download; vai em Content-Disposition. */
  filename?: string;
  contentType?: string;
  /** "inline" para abrir no navegador (PDF, imagem), "attachment" para baixar. */
  disposition?: 'inline' | 'attachment';
  expiresIn: number;
};

export type ObjectInfo = { size: number; contentType?: string };

export interface ObjectStorage {
  /** URL assinada para o navegador enviar o arquivo direto ao bucket (PUT). */
  putUrl(
    key: string,
    opts: PutUrlOptions,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  /** URL assinada de leitura, de vida curta. */
  getUrl(key: string, opts: GetUrlOptions): Promise<string>;
  head(key: string): Promise<ObjectInfo | null>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Apaga tudo sob o prefixo. Devolve quantos objetos saíram. */
  deletePrefix(prefix: string): Promise<number>;
}

/** Chaves do bucket. O prefixo por aluno permite apagar tudo de uma pessoa de uma vez. */
export const keys = {
  userPrefix: (userId: string) => `u/${userId}/`,
  original: (userId: string, fileId: string) => `u/${userId}/f/${fileId}/original`,
  pdf: (userId: string, fileId: string) => `u/${userId}/f/${fileId}/pdf`,
  thumbnail: (userId: string, fileId: string, page: number) =>
    `u/${userId}/f/${fileId}/pages/${page}.jpg`,
};

/** Content-Disposition seguro: nome ASCII de reserva e o nome real em UTF-8 (RFC 6266). */
export function contentDisposition(kind: 'inline' | 'attachment', filename?: string) {
  if (!filename) return kind;
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
