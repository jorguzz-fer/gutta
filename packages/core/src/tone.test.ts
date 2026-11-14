import { describe, expect, it } from 'vitest';
import { toneIssues } from './tone';

describe('tom de voz (SPEC v2, 6.2)', () => {
  it('aceita os exemplos de "faça"', () => {
    for (const ok of [
      'Sua semana ficou mais ocupada do que o previsto. Quer reorganizar?',
      'Faltam 3 horas para a sugestão de 20.',
      'Planejamento a revisar: duas tarefas não cabem nos horários disponíveis.',
      'Sua rotina soma 25 horas de estudo, acima da sugestão de 20 horas. Se a semana pesar, dá para reduzir.',
      'Revisões de hoje: 12 cartões.',
    ])
      expect(toneIssues(ok)).toEqual([]);
  });

  it('recusa os exemplos de "não faça" e a lista de palavras', () => {
    const cases: [string, string][] = [
      ['Você está atrasado.', 'atraso-pessoal'],
      ['Você não cumpriu sua meta.', 'cobranca'],
      ['Você parece sobrecarregado.', 'estado-emocional'],
      ['Isso foi um fracasso.', 'fracasso'],
      ['A culpa é sua.', 'culpa'],
      ['VOCÊ ESTÁ CANSADA hoje', 'estado-emocional'],
      ['Déficit de 3 horas', 'deficit'],
    ];
    for (const [text, rule] of cases) expect(toneIssues(text).map((i) => i.rule)).toContain(rule);
  });
});
