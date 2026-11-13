import { describe, expect, it } from 'vitest';
import { cumulativeAverages, formatGrade, gradeSummary, neededGrade } from './grades';

describe('média (NOT-02, NOT-09, NOT-10)', () => {
  // Tela T22: A1 8,5 (peso 1), P1 7,0 (peso 3), A2 9,0 (peso 1), P2 6,5 (peso 3).
  const t22 = [
    { id: 'a1', grade: 8.5, weight: 1 },
    { id: 'p1', grade: 7, weight: 3 },
    { id: 'a2', grade: 9, weight: 1 },
    { id: 'p2', grade: 6.5, weight: 3 },
  ];

  it('simples e ponderada por pesos', () => {
    expect(gradeSummary('simples', t22).current).toBe(7.75);
    expect(gradeSummary('pesos', t22).current).toBe(7.25);
  });

  it('nota pendente não é zero: a média considera só o lançado', () => {
    const s = gradeSummary('pesos', [...t22, { id: 'p3', grade: null, weight: 4 }]);
    expect(s).toMatchObject({
      current: 7.25,
      graded: 4,
      pending: 1,
      doneShare: 8,
      remainingShare: 4,
    });
    expect(gradeSummary('pesos', [{ id: 'x', grade: null }]).current).toBeNull();
  });

  it('percentual, com a soma das porcentagens à vista, e nota em outra escala', () => {
    const s = gradeSummary('percentual', [
      { id: 'p1', grade: 8, percent: 40 },
      { id: 'p2', grade: 60, maxGrade: 100, percent: 40 },
      { id: 'tr', grade: null, percent: 20 },
    ]);
    expect(s).toMatchObject({ current: 7, percentTotal: 100, doneShare: 80, remainingShare: 20 });
  });

  it('média acumulada em ordem, para o gráfico', () => {
    expect(cumulativeAverages('pesos', t22)).toEqual([8.5, 7.38, 7.7, 7.25]);
  });
});

describe('quanto preciso tirar (NOT-11)', () => {
  it('exemplo do documento: 6,5 com peso 6, restante 4, desejada 7 → 7,75', () => {
    expect(
      neededGrade({ currentAverage: 6.5, doneShare: 6, remainingShare: 4, desired: 7 }),
    ).toEqual({ status: 'alcancavel', needed: 7.75 });
  });
  it('acima da nota máxima, não alcançável; zero ou menos, garantida; sem restantes', () => {
    expect(
      neededGrade({ currentAverage: 3, doneShare: 8, remainingShare: 2, desired: 7 }).status,
    ).toBe('inalcancavel');
    expect(
      neededGrade({ currentAverage: 9.5, doneShare: 9, remainingShare: 1, desired: 7 }),
    ).toEqual({ status: 'garantida', needed: 0 });
    expect(
      neededGrade({ currentAverage: 7, doneShare: 10, remainingShare: 0, desired: 7 }).status,
    ).toBe('sem_restantes');
  });
  it('formato brasileiro', () => {
    expect(formatGrade(7.75)).toBe('7,75');
    expect(formatGrade(7)).toBe('7,0');
  });
});
