import { FsStorage } from './fs';
import { MemoryStorage } from './memory';
import { S3Storage } from './s3';
import type { ObjectStorage } from './types';

export * from './types';
export { MemoryStorage } from './memory';
export { FsStorage } from './fs';
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
  if (env.STORAGE_DRIVER === 'fs') {
    // O E2E roda o build de produção; só ele liga esta exceção, e de propósito.
    if (env.NODE_ENV === 'production' && env.E2E_ALLOW_DEV_STORAGE !== '1') {
      throw new Error('STORAGE_DRIVER=fs não vale em produção');
    }
    if (!env.STORAGE_FS_DIR || !env.STORAGE_FS_SECRET || !env.APP_URL) {
      throw new Error('STORAGE_DRIVER=fs pede STORAGE_FS_DIR, STORAGE_FS_SECRET e APP_URL');
    }
    return new FsStorage(env.STORAGE_FS_DIR, env.APP_URL, env.STORAGE_FS_SECRET);
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
