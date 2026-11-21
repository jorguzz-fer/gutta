/* global process */
// Gera src/piece-fonts.ts com as fontes do app em base64, para as peças serem autocontidas
// (iframe isolado, teste com Playwright e download funcionam sem rede). Rodar ao trocar as fontes:
//   node packages/core/scripts/gen-piece-fonts.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../../../apps/web/src/fonts');
const faces = [
  ['Archivo Black', 400, 'archivo-black-latin-400.woff2'],
  ['Hind', 400, 'hind-latin-400.woff2'],
  ['Hind', 500, 'hind-latin-500.woff2'],
  ['Hind', 600, 'hind-latin-600.woff2'],
  ['Hind', 700, 'hind-latin-700.woff2'],
];
const css = faces
  .map(
    ([family, weight, file]) =>
      `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${readFileSync(path.join(dir, file)).toString('base64')}) format("woff2")}`,
  )
  .join('\n');
writeFileSync(
  path.resolve(import.meta.dirname, '../src/piece-fonts.ts'),
  `// Gerado por scripts/gen-piece-fonts.mjs a partir de apps/web/src/fonts (licença em LICENSE.md lá).\n// Fica fora do index do pacote para não ir parar no JavaScript do navegador.\nexport const PIECE_FONT_CSS =\n  ${JSON.stringify(css)};\n`,
);
process.stdout.write(`piece-fonts.ts gerado (${css.length} caracteres)\n`);
