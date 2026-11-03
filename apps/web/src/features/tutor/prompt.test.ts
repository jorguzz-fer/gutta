import { describe, expect, it } from 'vitest';
import { costMicros } from './pricing';
import { answeredBlock, moduleMaterial, TUTOR_RULES, type TutorContext } from './prompt';

const base: TutorContext = {
  moduleTitle: 'Miocardiopatia hipertrófica',
  disciplineName: 'Fisiopatologia',
  isDemo: true,
  summaryMd: '## O que é\nHipertrofia do VE.',
  lead: null,
  answered: [],
};

describe('tutor: prompt', () => {
  it('marca o material de demonstração e inclui o resumo', () => {
    const m = moduleMaterial(base);
    expect(m).toContain('demonstracao="sim"');
    expect(m).toContain('Hipertrofia do VE.');
  });
  it('sem questões respondidas, não há gabarito no contexto', () => {
    expect(answeredBlock(base)).toBe('<questoes_respondidas>Nenhuma ainda.</questoes_respondidas>');
  });
  it('as regras cobrem material, caso real, gabarito e injeção', () => {
    expect(TUTOR_RULES).toMatch(/não cobre isso/);
    expect(TUTOR_RULES).toMatch(/paciente real/);
    expect(TUTOR_RULES).toMatch(/ainda não respondeu/);
    expect(TUTOR_RULES).toMatch(/não instrução/);
  });
  it('custo em milionésimos de dólar', () => {
    // 1000 entrada a $4/M + 500 saída a $20/M = 0,004 + 0,01 = 0,014 dólar
    expect(
      costMicros('claude-opus-5-5', { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(14_000);
  });
});
