import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../client';
import { bootstrapAdmins, parseAdminEmails } from './bootstrap-admins';
import { seedCatalog } from './catalog-seed';

// Retenção LGPD: apaga o que passou do prazo e executa exclusões vencidas.
// Falha aqui não derruba o app (o admin roda de novo em /admin/privacidade).
async function retention(db: ReturnType<typeof createDb>) {
  try {
    const res = await db.execute<{ r: Record<string, number> }>(sql`SELECT apply_retention() AS r`);
    console.log(
      JSON.stringify({ level: 'info', event: 'db.retention_applied', ...res.rows[0]?.r }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'db.retention_failed', err: String(err) }),
    );
  }
}

// Entrada empacotada (esbuild) que roda no start do container, antes do servidor.
async function main() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL não definida');
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations');
  const pool = createPool(url, 1);
  // --retention-only: tarefa agendada diária (Coolify), sem migrations nem seeds.
  const retentionOnly = process.argv.includes('--retention-only');
  try {
    const db = createDb(pool);
    if (retentionOnly) {
      await retention(db);
      return;
    }
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
    await retention(db);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', event: 'db.migrate_failed', err: String(err) }));
  process.exit(1);
});
