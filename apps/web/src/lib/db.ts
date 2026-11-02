import 'server-only';
import { createDb, createPool, type Db } from '@gutta/db';
import { env } from './env';

// Um pool por processo. Em dev, o HMR recarrega módulos; o globalThis evita abrir pools a mais.
const g = globalThis as unknown as { __guttaDb?: Db };

export function db(): Db {
  if (!g.__guttaDb) {
    const e = env();
    g.__guttaDb = createDb(createPool(e.DATABASE_URL, e.DB_POOL_MAX));
  }
  return g.__guttaDb;
}
