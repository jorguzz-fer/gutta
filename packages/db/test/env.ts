// URLs do banco de teste. Na CI vêm do serviço Postgres do job; localmente, dos defaults.
export const TEST_OWNER_URL =
  process.env.TEST_DATABASE_OWNER_URL ??
  'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test';
export const TEST_APP_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://gutta_app:gutta_app_dev@localhost:5432/gutta_test';
export const TEST_SUPERUSER_URL =
  process.env.PG_SUPERUSER_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
