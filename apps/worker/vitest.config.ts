import { defineConfig } from 'vitest/config';

// Integração: Postgres de teste (o mesmo de packages/db) e Redis local.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
});
