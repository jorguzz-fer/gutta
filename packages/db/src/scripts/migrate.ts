import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../client';
import { loadEnv, requireEnv } from './env';

// Aplica as migrations como dono do schema. Roda no start do container e no setup local.
export async function runMigrations(url = requireEnv('DATABASE_OWNER_URL')) {
  const pool = createPool(url, 1);
  try {
    await migrate(createDb(pool), {
      migrationsFolder: path.resolve(import.meta.dirname, '../../migrations'),
    });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  runMigrations()
    .then(() => console.log('migrations aplicadas'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
