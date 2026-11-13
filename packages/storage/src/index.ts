import { MemoryStorage } from './memory';
import { S3Storage } from './s3';
import type { ObjectStorage } from './types';

export * from './types';
export { MemoryStorage } from './memory';
export { S3Storage, type S3Config } from './s3';

type Env = Record<string, string | undefined>;

/**
 * Armazenamento a partir das variáveis STORAGE_*. Sem configuração, devolve null: o envio de
 * arquivos fica indisponível e o resto da plataforma segue. STORAGE_DRIVER=memory só em teste.
 */
export function storageFromEnv(env: Env): ObjectStorage | null {
  if (env.STORAGE_DRIVER === 'memory') {
    if (env.NODE_ENV === 'production')
      throw new Error('STORAGE_DRIVER=memory não vale em produção');
    return new MemoryStorage();
  }
  const { STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } =
    env;
  if (
    !STORAGE_ENDPOINT ||
    !STORAGE_BUCKET ||
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY
  ) {
    return null;
  }
  return new S3Storage({
    endpoint: STORAGE_ENDPOINT,
    region: env.STORAGE_REGION || 'auto',
    bucket: STORAGE_BUCKET,
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  });
}
