import { describe, expect, it } from 'vitest';
import { hits, strokeOutline, thin, type Shape } from './geometry';

describe('camada de marcações (ADR 0015)', () => {
  it('traço com pressão vira um contorno fechado; um ponto vira círculo', () => {
    const d = strokeOutline(
      [
        [10, 10, 0.2],
        [50, 10, 1],
      ],
      4,
    );
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // Mais pressão, mais grosso: o lado do fim fica mais longe da linha do traço.
    expect(d).toContain('50,13.2');
    expect(strokeOutline([[5, 5, 0.5]], 4)).toMatch(/^M3,5a/);
  });

  it('a borracha acha o traço perto da linha e não o que está longe', () => {
    const pen: Shape = {
      id: 'a',
      kind: 'pen',
      color: '#000000',
      width: 0.01,
      points: [
        [0.1, 0.1, 0.5],
        [0.5, 0.1, 0.5],
      ],
    };
    expect(hits(pen, 300, 143, 1000, 1400, 6)).toBe(true);
    expect(hits(pen, 300, 300, 1000, 1400, 6)).toBe(false);
    const rect: Shape = {
      id: 'b',
      kind: 'rect',
      color: '#000000',
      width: 0.004,
      x: 0.2,
      y: 0.2,
      w: 0.2,
      h: 0.1,
    };
    expect(hits(rect, 250, 300, 1000, 1000, 4)).toBe(true);
  });

  it('descarta pontos colados e mantém o último', () => {
    const pts = thin(
      [
        [0, 0, 0.5],
        [0.0001, 0, 0.5],
        [0.01, 0, 0.5],
        [0.0101, 0, 0.5],
      ],
      1000,
      1000,
    );
    expect(pts.map((p) => p[0])).toEqual([0, 0.01, 0.0101]);
  });
});
