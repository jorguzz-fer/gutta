import { describe, expect, it } from 'vitest';
import { atRisk, neededGrade } from './grades';
import { disciplineProgress, overallProgress } from './progress';

describe('progresso (6.4, D13)', () => {
  it('aulas concluídas sobre aulas ocorridas; sem cronograma, sem percentual', () => {
    expect(disciplineProgress({ lessons: 20, occurred: 8, concluded: 6 })).toBe(75);
    expect(disciplineProgress({ lessons: 0, occurred: 0, concluded: 0 })).toBeNull();
    expect(disciplineProgress({ lessons: 20, occurred: 0, concluded: 0 })).toBeNull();
    // Concluída que ainda não ocorreu não passa de 100%.
    expect(disciplineProgress({ lessons: 20, occurred: 2, concluded: 3 })).toBe(100);
  });

  it('geral ponderado pelo número de aulas', () => {
    expect(
      overallProgress([
        { lessons: 10, occurred: 10, concluded: 10 },
        { lessons: 40, occurred: 30, concluded: 0 },
        { lessons: 0, occurred: 0, concluded: 0 },
      ]),
    ).toBe(25);
    expect(overallProgress([{ lessons: 0, occurred: 0, concluded: 0 }])).toBeNull();
  });
});

describe('"em risco" (NOT-16, D13)', () => {
  const at = (current: number, done: number, rest: number, desired = 7) =>
    atRisk({
      needed: neededGrade({
        currentAverage: current,
        doneShare: done,
        remainingShare: rest,
        desired,
      }),
      currentAverage: current,
    });

  it('precisa de mais que a média atual: em risco', () => {
    // Exemplo do documento: média 6,5, precisa de 7,75.
    expect(at(6.5, 6, 4)).toBe(true);
  });
  it('precisa de mais de 80% da nota máxima: em risco', () => {
    expect(atRisk({ needed: { status: 'alcancavel', needed: 8.5 }, currentAverage: 9 })).toBe(true);
  });
  it('precisa de menos que a média e menos de 80%: sem risco', () => {
    expect(at(8, 6, 4)).toBe(false);
  });
  it('garantida ou não alcançável não é "em risco"', () => {
    expect(at(10, 9, 1)).toBe(false);
    expect(at(2, 9, 1)).toBe(false);
  });
});
