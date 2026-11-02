import { runMigrations } from './migrate';
import { dbNameOf, ensureRolesAndDatabase, passwordOf } from './roles';
import { loadEnv, requireEnv } from './env';
import { runSeed } from './seed';

// pnpm db:setup: papéis, banco, migrations e seeds de demonstração no Postgres local.
async function main() {
  loadEnv();
  const ownerUrl = requireEnv('DATABASE_OWNER_URL');
  const appUrl = requireEnv('DATABASE_URL');
  await ensureRolesAndDatabase({
    superuserUrl:
      process.env.PG_SUPERUSER_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
    dbName: dbNameOf(ownerUrl),
    ownerPassword: passwordOf(ownerUrl),
    appPassword: passwordOf(appUrl),
  });
  await runMigrations(ownerUrl);
  console.log('migrations aplicadas');
  if (process.argv.includes('--no-seed')) return;
  await runSeed(ownerUrl);
  console.log('seeds de demonstração aplicados');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
