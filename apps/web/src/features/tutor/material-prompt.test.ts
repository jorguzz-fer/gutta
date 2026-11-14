import { describe, expect, it } from 'vitest';
import { doubtsBlock, extractCitations, materialPagesBlock } from './material-prompt';

// Tutor sobre os materiais (SPEC v2, AJU-08; IA-2, IA-9).
describe('tutor sobre os materiais', () => {
  const valid = new Map([
    ['P1', { label: 'Slides, página 1', materialId: 'm1', page: 1 }],
    ['P2', { label: 'Slides, página 2', materialId: 'm1', page: 2 }],
  ]);

  it('mantém as citações que existem e tira as inventadas', () => {
    const r = extractCitations(
      'Macrófagos predominam [P2]. Neutrófilos chegam primeiro [P1, P9]. Isso vem do nada [P7].',
      valid,
    );
    expect(r.text).toBe(
      'Macrófagos predominam [P2]. Neutrófilos chegam primeiro [P1]. Isso vem do nada.',
    );
    expect(r.citations.map((c) => c.ref)).toEqual(['P1', 'P2']);
  });

  it('material e dúvidas em blocos de dado, com etiqueta', () => {
    const m = materialPagesBlock([{ ref: 'P1', label: 'Slides "A"', text: 'texto' }], 'aula');
    expect(m).toContain('<pagina etiqueta="P1" origem="Slides \'A\'">');
    expect(doubtsBlock(['Por que edema?'])).toContain('1. Por que edema?');
    expect(doubtsBlock([])).toContain('Nenhuma');
  });
});
