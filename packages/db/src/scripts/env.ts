import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Carrega o .env da raiz do repositório sem dependência extra. Variáveis já definidas vencem.
export function loadEnv() {
  const file = path.resolve(import.meta.dirname, '../../../../.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (raw ?? '').replace(/^"(.*)"$/, '$1');
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não definida (veja .env.example)`);
  return v;
}
