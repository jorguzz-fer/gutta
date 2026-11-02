import { describe, expect, it } from 'vitest';
import {
  questionOfTheDay,
  selectNextQuestion,
  targetDifficulty,
  type Candidate,
} from './selection';

const now = new Date('2026-11-10T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const noRandom = () => 0;
const base = { history: new Map(), mastery: new Map(), now, random: noRandom };

describe('seleção da próxima questão', () => {
  const qs: Candidate[] = [
    { id: 'a', topicId: 't1', difficulty: 2 },
    { id: 'b', topicId: 't1', difficulty: 2 },
    { id: 'c', topicId: 't2', difficulty: 2 },
  ];

  it('nunca repete questão da sessão e termina quando acabam', () => {
    expect(
      selectNextQuestion(qs, { ...base, answeredInSession: new Set(['a', 'b', 'c']) }),
    ).toBeNull();
    const next = selectNextQuestion(qs, { ...base, answeredInSession: new Set(['a']) });
    expect(next?.id).not.toBe('a');
  });

  it('prefere questão inédita a uma respondida', () => {
    const history = new Map([
      ['a', { lastAnsweredAt: daysAgo(30), lastCorrect: true }],
      ['b', { lastAnsweredAt: daysAgo(30), lastCorrect: false }],
    ]);
    const next = selectNextQuestion(qs, { ...base, history, answeredInSession: new Set() });
    expect(next?.id).toBe('c');
  });

  it('não repete questão acertada há poucos dias se houver outra', () => {
    const history = new Map([['c', { lastAnsweredAt: daysAgo(2), lastCorrect: true }]]);
    const next = selectNextQuestion([qs[2]!, { id: 'd', topicId: 't2', difficulty: 4 }], {
      ...base,
      history,
      answeredInSession: new Set(),
    });
    expect(next?.id).toBe('d');
  });

  it('diversifica o assunto quando há alternativa', () => {
    const next = selectNextQuestion(qs, {
      ...base,
      answeredInSession: new Set(['a']),
      lastTopicId: 't1',
    });
    expect(next?.topicId).toBe('t2');
  });

  it('dificuldade alvo acompanha o domínio', () => {
    expect(targetDifficulty(undefined)).toBe(2);
    expect(targetDifficulty({ estimatedMastery: 0.3, confidence: 'medium' })).toBeLessThan(2);
    expect(targetDifficulty({ estimatedMastery: 0.9, confidence: 'high' })).toBe(4);
    const pick = selectNextQuestion(
      [
        { id: 'easy', topicId: 't', difficulty: 1 },
        { id: 'hard', topicId: 't', difficulty: 4 },
      ],
      {
        ...base,
        answeredInSession: new Set(),
        mastery: new Map([['t', { estimatedMastery: 0.9, confidence: 'high' as const }]]),
      },
    );
    expect(pick?.id).toBe('hard');
  });
});

describe('questão do dia', () => {
  it('é estável no mesmo dia e muda entre dias', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `q${i}`);
    const d1 = questionOfTheDay(ids, new Set(), '2026-11-10', 'aluno');
    expect(questionOfTheDay([...ids].reverse(), new Set(), '2026-11-10', 'aluno')).toBe(d1);
    const days = new Set(
      Array.from({ length: 7 }, (_, i) =>
        questionOfTheDay(ids, new Set(), `2026-11-1${i}`, 'aluno'),
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });
  it('prefere as que o aluno ainda não fez', () => {
    expect(questionOfTheDay(['a', 'b'], new Set(['a']), '2026-11-10', 'x')).toBe('b');
    expect(questionOfTheDay([], new Set(), '2026-11-10', 'x')).toBeNull();
  });
});
