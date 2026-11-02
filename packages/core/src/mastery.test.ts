import { describe, expect, it } from 'vitest';
import { estimateMastery, isWeak, masteryBand } from './mastery';

const now = new Date('2026-11-10T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const a = (isCorrect: boolean, d = 2, age = 0) => ({
  isCorrect,
  difficulty: d,
  answeredAt: daysAgo(age),
});

describe('estimativa de domínio', () => {
  it('com menos de 3 tentativas não há número: sem diagnóstico', () => {
    const m = estimateMastery([a(true), a(true)], now);
    expect(m.estimatedMastery).toBeNull();
    expect(m.confidence).toBe('insufficient');
    expect(masteryBand(m)).toBe('sem_diagnostico');
  });

  it('amostra pequena é puxada para o meio (3 acertos não viram 100%)', () => {
    const m = estimateMastery([a(true), a(true), a(true)], now);
    expect(m.estimatedMastery!).toBeGreaterThan(0.6);
    expect(m.estimatedMastery!).toBeLessThan(0.85);
    expect(m.confidence).toBe('low');
    expect(masteryBand(m)).toBe('comecando');
  });

  it('erros recentes pesam mais que acertos antigos', () => {
    const recentErrors = estimateMastery(
      [a(true, 2, 60), a(true, 2, 60), a(true, 2, 60), a(false), a(false), a(false)],
      now,
    );
    const recentHits = estimateMastery(
      [a(false, 2, 60), a(false, 2, 60), a(false, 2, 60), a(true), a(true), a(true)],
      now,
    );
    expect(recentErrors.estimatedMastery!).toBeLessThan(0.5);
    expect(recentHits.estimatedMastery!).toBeGreaterThan(0.5);
  });

  it('acertar difícil vale mais que acertar fácil', () => {
    const hard = estimateMastery(
      [a(true, 5), a(true, 5), a(false, 5), a(true, 5), a(false, 5), a(true, 5)],
      now,
    );
    const easy = estimateMastery(
      [a(true, 1), a(true, 1), a(false, 1), a(true, 1), a(false, 1), a(true, 1)],
      now,
    );
    expect(hard.estimatedMastery!).toBeGreaterThan(easy.estimatedMastery!);
  });

  it('faixas e assunto fraco', () => {
    const weak = estimateMastery(
      Array.from({ length: 8 }, (_, i) => a(i < 2)),
      now,
    );
    expect(masteryBand(weak)).toBe('fragil');
    expect(isWeak(weak)).toBe(true);
    const strong = estimateMastery(
      Array.from({ length: 12 }, () => a(true, 3)),
      now,
    );
    expect(masteryBand(strong)).toBe('firme');
    expect(strong.confidence).toBe('high');
    expect(isWeak(strong)).toBe(false);
  });

  it('conta tentativas, acertos e a última data', () => {
    const m = estimateMastery([a(true, 2, 3), a(false, 2, 1), a(true, 2, 2)], now);
    expect(m.attemptCount).toBe(3);
    expect(m.correctCount).toBe(2);
    expect(m.lastAttemptAt).toEqual(daysAgo(1));
  });
});
