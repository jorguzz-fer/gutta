import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from './categories';
import { contrast } from './contrast';

// Confere as cores de categoria de tokens.css nos dois temas: texto sobre o fundo da
// categoria com 4,5:1 (texto normal, WCAG AA) e borda com 3:1 contra a superfície (componente
// de interface, WCAG 1.4.11).
const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};
const read = (scope: string, name: string) => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(scope);
  if (!m) throw new Error(`token ausente: --${name}`);
  return m[1]!.trim();
};

describe.each([
  ['escuro', block(':root')],
  ['claro', block(":root[data-theme='light']")],
])('categorias no tema %s', (_, scope) => {
  const surface = read(scope, 'surface');
  const bg = read(scope, 'bg');
  it.each(CATEGORY_COLORS.map((c) => [c.name, c.id]))('%s tem contraste AA', (_n, id) => {
    const fill = read(scope, `cat-${id}`);
    expect(contrast(read(scope, `cat-${id}-fg`), fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(read(scope, `cat-${id}-line`), surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(read(scope, `cat-${id}-line`), bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste', () => {
  it('confere com valores conhecidos', () => {
    expect(contrast('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 0);
    expect(contrast('oklch(0.5 0 0)', 'oklch(0.5 0 0)')).toBeCloseTo(1, 5);
  });
});
