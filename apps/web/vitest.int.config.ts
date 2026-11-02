import { defineConfig } from 'vitest/config';
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
      BETTER_AUTH_SECRET: 'teste-de-integracao-com-32-caracteres-ou-mais',
      APP_URL: 'http://localhost:3000',
    },
  },
});
