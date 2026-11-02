import { describe, expect, it } from 'vitest';
import { recommendNext, type TopicInput } from './recommend';

const t = (o: Partial<TopicInput>): TopicInput => ({
  topicId: 't',
  topicName: 'Assunto',
  disciplineId: 'd1',
  disciplineName: 'Fisiologia',
  attemptCount: 0,
  estimatedMastery: null,
  confidence: 'insufficient',
  questionCount: 5,
  ...o,
});

describe('próxima ação', () => {
  it('revisões vencidas vêm primeiro', () => {
    const r = recommendNext({ dueFlashcards: 3, topics: [t({})] });
    expect(r.reasonCode).toBe('flashcards_due');
    expect(r.title).toBe('Revisar 3 flashcards');
  });

  it('assunto fraco com prova próxima vence o resto', () => {
    const r = recommendNext({
      dueFlashcards: 0,
      topics: [
        t({
          topicId: 'forte',
          attemptCount: 10,
          estimatedMastery: 0.9,
          confidence: 'medium',
          examInDays: 5,
        }),
        t({
          topicId: 'fraco',
          topicName: 'MCH',
          attemptCount: 8,
          estimatedMastery: 0.3,
          confidence: 'medium',
          examInDays: 5,
        }),
        t({ topicId: 'outro', disciplineId: 'd2', attemptCount: 0 }),
      ],
    });
    expect(r.reasonCode).toBe('exam_soon_weak_topic');
    expect(r.topicId).toBe('fraco');
    expect(r.reason).toContain('5 dias');
  });

  it('cold start: sugere diagnóstico, nunca tela vazia', () => {
    const r = recommendNext({ dueFlashcards: 0, topics: [t({}), t({ topicId: 't2' })] });
    expect(r.type).toBe('diagnostic');
    expect(r.reasonCode).toBe('no_diagnostic');
  });

  it('sem prova: assunto mais fraco; sem fraco: o menos praticado', () => {
    const weak = recommendNext({
      dueFlashcards: 0,
      topics: [
        t({ topicId: 'a', attemptCount: 6, estimatedMastery: 0.5, confidence: 'medium' }),
        t({ topicId: 'b', attemptCount: 6, estimatedMastery: 0.2, confidence: 'medium' }),
      ],
    });
    expect(weak.topicId).toBe('b');
    const explore = recommendNext({
      dueFlashcards: 0,
      topics: [
        t({ topicId: 'a', attemptCount: 9, estimatedMastery: 0.9, confidence: 'medium' }),
        t({ topicId: 'b', attemptCount: 3, estimatedMastery: 0.8, confidence: 'low' }),
      ],
    });
    expect(explore.reasonCode).toBe('least_practiced');
    expect(explore.topicId).toBe('b');
  });

  it('ignora assunto sem questões e avisa quando não há conteúdo', () => {
    const r = recommendNext({ dueFlashcards: 0, topics: [t({ questionCount: 0 })] });
    expect(r.type).toBe('empty');
    expect(r.algorithmVersion).toMatch(/^recommend-v1/);
  });
});
