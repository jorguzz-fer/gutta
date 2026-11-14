import { describe, expect, it } from 'vitest';
import { matchPages, parseInline, parseNote, reviewList, reviewPriority } from './lesson';

describe('prioridade de revisão (AUL-21)', () => {
  it('importante e difícil vem antes de fácil e sem destaque', () => {
    const hard = reviewPriority({ importance: 'alta', difficulty: 'dificil', doubt: null });
    const important = reviewPriority({ importance: 'importante', difficulty: null, doubt: null });
    const easy = reviewPriority({ importance: 'nenhuma', difficulty: 'facil', doubt: null });
    expect(hard).toBeGreaterThan(important);
    expect(important).toBeGreaterThan(easy);
    expect(easy).toBe(0);
  });

  it('dúvida em aberto entra; resolvida não', () => {
    const open = { importance: 'nenhuma' as const, difficulty: null, doubt: '' };
    expect(reviewPriority(open)).toBeGreaterThan(0);
    expect(reviewPriority({ ...open, doubtResolved: true })).toBe(0);
  });

  it('a lista de revisão deixa de fora o que não precisa e ordena', () => {
    const list = reviewList([
      { id: 'a', importance: 'nenhuma', difficulty: 'facil', doubt: null },
      { id: 'b', importance: 'importante', difficulty: null, doubt: null },
      { id: 'c', importance: 'alta', difficulty: 'dificil', doubt: null },
    ] as const);
    expect(list.map((m) => m.id)).toEqual(['c', 'b']);
  });
});

describe('troca de versão (AUL-25)', () => {
  it('acha a página nova pelo texto, mesmo fora de ordem', () => {
    const old = [
      { page: 1, text: 'Inflamação aguda: vasodilatação e exsudato' },
      { page: 2, text: 'Inflamação crônica com macrófagos e linfócitos' },
      { page: 3, text: 'Cicatrização e reparo tecidual' },
    ];
    const next = [
      { page: 1, text: 'Sumário da aula' },
      { page: 2, text: 'Inflamação aguda: vasodilatação, exsudato e edema' },
      { page: 3, text: 'Inflamação crônica com macrófagos, linfócitos e plasmócitos' },
    ];
    expect(matchPages(old, next).map((m) => [m.from, m.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, null],
    ]);
  });

  it('página só de imagem fica na mesma posição; cada página nova recebe uma só', () => {
    const old = [
      { page: 1, text: '' },
      { page: 2, text: 'Necrose de coagulação' },
      { page: 3, text: 'Necrose de coagulação' },
    ];
    const next = [
      { page: 1, text: '' },
      { page: 2, text: 'Necrose de coagulação' },
    ];
    const m = matchPages(old, next);
    expect(m.map((x) => [x.from, x.to])).toEqual([
      [1, 1],
      [2, 2],
      [3, null],
    ]);
    expect(m[0]!.score).toBeLessThan(0.3);
  });
});

describe('caderno (AUL-08)', () => {
  it('negrito e fórmula no meio do texto', () => {
    expect(parseInline('A **PA** é $P = DC \\times RVP$.')).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'bold', text: 'PA' },
      { type: 'text', text: ' é ' },
      { type: 'math', tex: 'P = DC \\times RVP' },
      { type: 'text', text: '.' },
    ]);
  });

  it('listas, tabela com cabeçalho, fórmula em bloco e parágrafo', () => {
    const blocks = parseNote(
      [
        'Sinais cardinais:',
        '- calor',
        '- rubor',
        '',
        '1. aguda',
        '2. crônica',
        '',
        '| Tipo | Célula |',
        '|---|---|',
        '| aguda | neutrófilo |',
        '',
        '$$',
        'x^2',
        '$$',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'list', 'table', 'math']);
    expect(blocks[1]).toMatchObject({
      ordered: false,
      items: [[{ text: 'calor' }], [{ text: 'rubor' }]],
    });
    expect(blocks[2]).toMatchObject({ ordered: true });
    expect(blocks[3]).toMatchObject({
      header: [[{ text: 'Tipo' }], [{ text: 'Célula' }]],
      rows: [[[{ text: 'aguda' }], [{ text: 'neutrófilo' }]]],
    });
    expect(blocks[4]).toEqual({ type: 'math', tex: 'x^2' });
  });

  it('texto com sinais de HTML continua sendo só texto', () => {
    expect(parseNote('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
    ]);
  });
});
