import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Carrega o .env da raiz (local). Na CI as variáveis já vêm do job.
const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1');
  }
}

// E2E contra o build de produção (`next start`) e o Postgres com seeds de demonstração.
const PORT = Number(process.env.E2E_PORT ?? 3200);
export const BASE = `http://localhost:${PORT}`;
export const OUTBOX = path.join(os.tmpdir(), `gutta-e2e-outbox-${PORT}.jsonl`);

function withDb(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
export const E2E_DB = withDb(
  process.env.DATABASE_URL ?? 'postgres://gutta_app:gutta_app_dev@localhost:5432/gutta',
  'gutta_e2e',
);
export const E2E_OWNER_DB = withDb(
  process.env.DATABASE_OWNER_URL ?? 'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta',
  'gutta_e2e',
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
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
    // A landing não depende do banco: o globalSetup cria o gutta_e2e depois que o servidor sobe.
    url: `${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      APP_URL: BASE,
      DATABASE_URL: E2E_DB,
      MAIL_OUTBOX_FILE: OUTBOX,
      AUTH_RATE_LIMIT: 'off',
      LESSON_ORIGINS: 'https://aula.alumine.com.br',
    },
  },
});
