import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../client';
import { bootstrapAdmins, parseAdminEmails } from './bootstrap-admins';
import { seedCatalog } from './catalog-seed';

// Entrada empacotada (esbuild) que roda no start do container, antes do servidor.
async function main() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL não definida');
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations');
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: folder });
    console.log(
      JSON.stringify({ level: 'info', event: 'db.migrated', at: new Date().toISOString() }),
    );
    // Catálogo e conteúdo de demonstração em produção só por escolha explícita (ADR 0005).
    if (process.env.SEED_CATALOG === 'demo') {
      const cat = await seedCatalog(db, { authorId: null, reviewerId: null });
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'db.seed_catalog',
          topics: Object.keys(cat.topics).length,
        }),
      );
    }
    // Só ids no log, nunca e-mails (PII).
    const boot = await bootstrapAdmins(db, parseAdminEmails(process.env.BOOTSTRAP_ADMIN_EMAILS));
    if (boot.verified.length || boot.granted.length) {
      console.log(JSON.stringify({ level: 'info', event: 'db.bootstrap_admins', ...boot }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', event: 'db.migrate_failed', err: String(err) }));
  process.exit(1);
});
