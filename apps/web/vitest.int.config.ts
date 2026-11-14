import { defineConfig } from 'vitest/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// Integração: serviços do app contra o Postgres de teste (mesmo banco dos testes de packages/db).
const TEST_APP_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://gutta_app:gutta_app_dev@localhost:5432/gutta_test';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'src/test/empty.ts'),
    },
  },
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_APP_URL,
      // Gerado a cada execução: nenhum segredo fixo no repositório.
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
      APP_URL: 'http://localhost:3000',
      AI_PROVIDER: 'fake',
      PII_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      PII_HASH_KEY: randomBytes(32).toString('base64'),
    },
  },
});
