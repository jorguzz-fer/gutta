import { runMigrations } from '../src/scripts/migrate';
import { dbNameOf, ensureRolesAndDatabase, passwordOf } from '../src/scripts/roles';
import { runSeed } from '../src/scripts/seed';
import { TEST_APP_URL, TEST_OWNER_URL, TEST_SUPERUSER_URL } from './env';

export default async function setup() {
  await ensureRolesAndDatabase({
    superuserUrl: TEST_SUPERUSER_URL,
    dbName: dbNameOf(TEST_OWNER_URL),
    ownerPassword: passwordOf(TEST_OWNER_URL),
    appPassword: passwordOf(TEST_APP_URL),
  });
  await runMigrations(TEST_OWNER_URL);
  await runSeed(TEST_OWNER_URL);
}
