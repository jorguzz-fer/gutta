import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// E2E contra o build de produção (`next start`) e o Postgres com seeds de demonstração.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const BASE = `http://localhost:${PORT}`;
export const OUTBOX = path.resolve(import.meta.dirname, 'test-results/outbox.jsonl');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, grep: /@celular/ },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      APP_URL: BASE,
      MAIL_OUTBOX_FILE: OUTBOX,
      AUTH_RATE_LIMIT: 'off',
    },
  },
});
