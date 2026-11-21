import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assemblePiece, lintErrors, lintPiece, parsePieceSource, type PieceBlocks } from './piece';
import { PIECE_FONT_CSS } from './piece-fonts';

// As peças aprovadas do piloto (docs/producao/referencias) são o padrão: o linter não pode
// reprovar nenhuma delas.
const ROOT = new URL('../../../docs/producao/referencias/', import.meta.url);
function referencePieces() {
  const out: { aula: string; slug: string; blocks: PieceBlocks }[] = [];
  for (const aula of ['aula-1', 'aula-2']) {
    const dir = new URL(`${aula}/fontes/src/`, ROOT);
    for (const f of readdirSync(dir).sort()) {
      if (f === 'indice.html') continue;
      out.push({
        aula,
        slug: f.replace(/\.html$/, ''),
        blocks: parsePieceSource(readFileSync(new URL(f, dir), 'utf8')),
      });
    }
  }
  return out;
}

const ctx = {
  crumb: 'Fisiologia endócrina · Aula 2 · Eixo somatotrófico',
  foot: 'Base: Aires, <i>Fisiologia</i>, 5ª ed.',
  demo: true,
};

describe('peças de referência do piloto', () => {
  const pieces = referencePieces();

  it('lê os blocos das 18 peças aprovadas', () => {
    expect(pieces).toHaveLength(18);
    for (const p of pieces) {
      expect(p.blocks.title, p.slug).not.toBe('');
      expect(p.blocks.body, p.slug).toContain('<h1');
    }
  });

  it('nenhuma peça aprovada é reprovada pelo linter', () => {
    for (const p of pieces)
      expect(lintErrors(lintPiece(p.blocks)), `${p.aula}/${p.slug}`).toEqual([]);
  });
});

describe('montagem', () => {
  const blocks = parsePieceSource(
    readFileSync(new URL('aula-2/fontes/src/pulso.html', ROOT), 'utf8'),
  );

  it('monta com a base do piloto, fontes embutidas e o selo vindo do banco', () => {
    const html = assemblePiece(blocks, { ...ctx, fontCss: PIECE_FONT_CSS });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<title>O pulso do GH em 24 horas</title>');
    expect(html).toContain('Demonstração · sem revisão');
    expect(html).toContain('font-family:"Archivo Black"');
    expect(html).toContain('Fisiologia endócrina · Aula 2 · Eixo somatotrófico');
    expect(html).toContain('Base: Aires');
    expect(html).not.toMatch(/https?:\/\/fonts\./);
  });

  it('sem selo depois da revisão, e com tema fixo para a prévia', () => {
    const html = assemblePiece(blocks, { ...ctx, demo: false, theme: 'dark' });
    expect(html).not.toContain('Demonstração · sem revisão');
    expect(html).toContain('<html lang="pt-BR" data-theme="dark">');
  });

  it('escapa o título e a trilha', () => {
    const html = assemblePiece({ ...blocks, title: 'A < B & "C"' }, { ...ctx, crumb: '<b>x</b>' });
    expect(html).toContain('<title>A &lt; B &amp; &quot;C&quot;</title>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('linter', () => {
  const ok: PieceBlocks = {
    title: 'Teste',
    style: '',
    body: '<div class="eyebrow">Peça</div><h1>T</h1><p class="lead">L</p><svg aria-label="cena"></svg><p>Para fixar</p><p>Na prova</p>',
    script: 'const a = 1;',
  };
  const rules = (b: PieceBlocks) => lintErrors(lintPiece(b)).map((i) => i.rule);

  it('aceita a estrutura mínima', () => {
    expect(rules(ok)).toEqual([]);
  });

  it('cobra os quatro blocos e a cena', () => {
    expect(rules({ ...ok, body: '<p>só texto</p>' }).sort()).toEqual(
      ['closing', 'closing', 'opening', 'opening', 'opening', 'stage'].sort(),
    );
  });

  it('recusa recurso de fora, rede, armazenamento e código perigoso', () => {
    expect(rules({ ...ok, body: ok.body + '<img src="https://x.com/a.png">' })).toContain(
      'external-resource',
    );
    expect(rules({ ...ok, style: '@import url(https://x.com/a.css);' })).toContain('external-css');
    expect(rules({ ...ok, body: ok.body + '<iframe></iframe>' })).toContain('embedded-document');
    expect(rules({ ...ok, script: 'fetch("/api")' })).toContain('network');
    expect(rules({ ...ok, script: 'localStorage.x=1' })).toContain('storage');
    expect(rules({ ...ok, script: 'eval("1")' })).toContain('unsafe-code');
    expect(rules({ ...ok, script: 'parent.location="x"' })).toContain('unsafe-code');
    expect(rules({ ...ok, body: ok.body + '<script>1</script>' })).toContain('inline-script');
  });

  it('acha erro de sintaxe no script', () => {
    expect(rules({ ...ok, script: 'const = ;' })).toContain('syntax');
  });

  it('recusa peça grande demais', () => {
    expect(rules({ ...ok, script: `const s="${'x'.repeat(160_000)}";` })).toContain('size');
  });
});
