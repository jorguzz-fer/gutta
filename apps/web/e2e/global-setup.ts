import { runMigrations } from '../../../packages/db/src/scripts/migrate';
import {
  dbNameOf,
  ensureRolesAndDatabase,
  passwordOf,
} from '../../../packages/db/src/scripts/roles';
import { runSeed } from '../../../packages/db/src/scripts/seed';
import { E2E_DB, E2E_OWNER_DB } from '../playwright.config';

// Banco próprio do E2E (gutta_e2e): os testes publicam questões e criam contas sem sujar o de dev.
export default async function setup() {
  await ensureRolesAndDatabase({
    superuserUrl:
      process.env.PG_SUPERUSER_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
    dbName: dbNameOf(E2E_OWNER_DB),
    ownerPassword: passwordOf(E2E_OWNER_DB),
    appPassword: passwordOf(E2E_DB),
  });
  await runMigrations(E2E_OWNER_DB);
  await runSeed(E2E_OWNER_DB);
}
