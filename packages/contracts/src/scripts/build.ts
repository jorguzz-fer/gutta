import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApi } from '../openapi';

// Gera packages/contracts/openapi.json. Com --check, só compara e falha se estiver
// desatualizado (o CI usa assim; ADR 0019).
const file = path.resolve(import.meta.dirname, '../../openapi.json');
const next = `${JSON.stringify(buildOpenApi(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // arquivo ausente conta como desatualizado
  }
  if (current !== next) {
    console.error('openapi.json desatualizado. Rode: pnpm --filter @gutta/contracts build');
    process.exit(1);
  }
  console.log('openapi.json em dia');
} else {
  writeFileSync(file, next);
  console.log(`openapi.json gerado (${next.length} bytes)`);
}
