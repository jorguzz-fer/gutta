import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { assemblePiece, parsePieceSource, type PieceBlocks } from '@gutta/core';
import { PIECE_FONT_CSS } from '@gutta/core/piece-fonts';
import { PlaywrightRenderer } from '../src/pieces/render';

// Teste de render das peças (ADR 0021). Critério da Fase 2: as peças da Aula 2 passam nos dois
// temas sem ajuste manual. Aqui, as peças aprovadas do piloto mostram que o teste não reprova
// peça boa; as quebradas, que ele pega o que o piloto encontrou à mão.
const renderer = new PlaywrightRenderer(process.env.PIECE_CHROMIUM_PATH);
afterAll(() => renderer.close());

const ctx = { crumb: 'Fisiologia endócrina · Aula 2', foot: 'Base: Aires.', demo: true };
const html = (b: PieceBlocks) => assemblePiece(b, { ...ctx, fontCss: PIECE_FONT_CSS });

const AULA2 = new URL('../../../docs/producao/referencias/aula-2/fontes/src/', import.meta.url);
const aula2 = readdirSync(AULA2)
  .filter((f) => f !== 'indice.html')
  .sort();

describe('peças aprovadas da Aula 2', () => {
  it.each(aula2)('%s passa nos temas claro e escuro', async (f) => {
    const report = await renderer.test(
      html(parsePieceSource(readFileSync(new URL(f, AULA2), 'utf8'))),
    );
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => `${c.theme}-${c.viewport}`)).toEqual([
      'light-desktop',
      'dark-desktop',
      'light-mobile',
    ]);
    for (const c of report.checks) expect(c.screenshot.length).toBeGreaterThan(10_000);
  });
});

const base: PieceBlocks = {
  title: 'Peça de teste',
  style: '',
  body: `<section><div class="eyebrow">Peça interativa</div><h1>Título</h1><p class="lead">Lead.</p></section>
<div class="card stage"><svg viewBox="0 0 400 200" aria-label="cena"><rect x="10" y="10" width="380" height="180" fill="var(--surface-2)"/><circle cx="60" cy="60" r="20" fill="var(--accent)"/><circle cx="160" cy="60" r="20" fill="var(--h1)"/><text x="40" y="150" font-size="16" fill="var(--fg)">Hipotálamo</text></svg></div>
<div class="card explain"><div><div class="eyebrow">Para fixar</div><p>Mecanismo.</p></div><div class="exam"><div class="lbl">Na prova</div><p>Pegadinha.</p></div></div>`,
  script: '',
};

describe('peças com defeito', () => {
  it('uma peça certa passa', async () => {
    expect((await renderer.test(html(base))).problems).toEqual([]);
  });

  it('erro de script reprova nos dois temas', async () => {
    const r = await renderer.test(html({ ...base, script: 'undefinedFn();' }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('Erro de script (tema claro)'))).toBe(true);
    expect(r.problems.some((p) => p.includes('Erro de script (tema escuro)'))).toBe(true);
  });

  it('texto sobreposto no SVG reprova', async () => {
    const body = base.body.replace(
      '<text x="40" y="150"',
      '<text x="40" y="150" font-size="16">Adeno-hipófise</text><text x="44" y="152"',
    );
    const r = await renderer.test(html({ ...base, body }));
    expect(r.problems.some((p) => p.startsWith('Texto sobreposto (tema claro)'))).toBe(true);
  });

  it('cena vazia reprova: a peça precisa abrir num estado útil', async () => {
    const body = base.body.replace(
      /<svg[\s\S]*<\/svg>/,
      '<canvas id="cv" style="width:100%;height:300px" aria-label="cena"></canvas>',
    );
    const r = await renderer.test(html({ ...base, body }));
    expect(r.problems.some((p) => p.startsWith('A cena abriu vazia'))).toBe(true);
  });

  it('rolagem lateral no computador reprova; só no celular, avisa', async () => {
    const wide = await renderer.test(html({ ...base, style: '.stage{min-width:1600px}' }));
    expect(wide.problems).toContain('A página rola para o lado (tema claro).');
    const mobileOnly = await renderer.test(html({ ...base, style: '.stage{min-width:700px}' }));
    expect(mobileOnly.ok).toBe(true);
    expect(mobileOnly.warnings).toContain('A página rola para o lado (tema claro, celular).');
  });

  it('a peça não sai para a rede', async () => {
    const r = await renderer.test(
      html({ ...base, script: 'new Image().src = "https://example.com/x.png";' }),
    );
    // O pedido é bloqueado; a peça segue de pé (o linter é quem recusa o recurso de fora).
    expect(r.problems.filter((p) => p.startsWith('Erro de script'))).toEqual([]);
  });
});
