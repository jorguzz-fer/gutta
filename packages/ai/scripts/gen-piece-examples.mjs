/* global process */
// Gera src/piece-examples.ts com uma peça aprovada do piloto por tipo (docs/producao/referencias),
// para o escritor de peças seguir o padrão e para o escritor de teste. Rodar quando o piloto mudar:
//   node packages/ai/scripts/gen-piece-examples.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ref = path.resolve(import.meta.dirname, '../../../docs/producao/referencias');
const BY_TYPE = {
  simulator: 'aula-2/pulso',
  animation: 'aula-1/paracrina',
  stepper: 'aula-1/vias-sinalizacao',
  map: 'aula-1/glandulas',
  defect_map: 'aula-1/esteroides',
  timeline: 'aula-1/linha-do-tempo',
};
const entries = Object.entries(BY_TYPE).map(
  ([type, slug]) =>
    `  ${type}: ${JSON.stringify(readFileSync(path.join(ref, slug.split('/')[0], 'fontes/src', `${slug.split('/')[1]}.html`), 'utf8'))},`,
);
writeFileSync(
  path.resolve(import.meta.dirname, '../src/piece-examples.ts'),
  `// Gerado por scripts/gen-piece-examples.mjs: peças aprovadas das Aulas 1 e 2 de Fisiologia Endócrina
// (piloto de 17/11/2026), no formato-fonte com blocos @@TITLE, @@STYLE, @@BODY e @@SCRIPT.
export const PIECE_EXAMPLES: Record<string, string> = {
${entries.join('\n')}
};
`,
);
process.stdout.write('piece-examples.ts gerado\n');
