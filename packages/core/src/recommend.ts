import { isWeak, type Confidence } from './mastery';

/*
  Próxima ação recomendada V1 (SPEC QUE-02, HOME-01). Prioridade:
  1. revisões de flashcard vencidas;
  2. assunto fraco de disciplina com prova em até 21 dias;
  3. disciplina ativa ainda sem diagnóstico;
  4. assunto fraco de disciplina ativa;
  5. exploração: o assunto ativo menos praticado.
  Cada recomendação leva um código de motivo e a versão do algoritmo (auditoria).
*/
export const RECOMMENDATION_ALGORITHM = 'recommend-v1-2026-11';

export type TopicInput = {
  topicId: string;
  topicName: string;
  disciplineId: string;
  disciplineName: string;
  attemptCount: number;
  estimatedMastery: number | null;
  confidence: Confidence;
  questionCount: number;
  examInDays?: number | null;
};

export type Recommendation = {
  type: 'review_flashcards' | 'practice_topic' | 'diagnostic' | 'explore' | 'empty';
  reasonCode:
    | 'flashcards_due'
    | 'exam_soon_weak_topic'
    | 'exam_soon_no_data'
    | 'no_diagnostic'
    | 'weak_topic'
    | 'least_practiced'
    | 'no_content';
  topicId?: string;
  disciplineId?: string;
  title: string;
  reason: string;
  count: number;
  algorithmVersion: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function recommendNext(input: {
  dueFlashcards: number;
  topics: TopicInput[];
  sessionSize?: number;
}): Recommendation {
  const size = input.sessionSize ?? 5;
  const base = { algorithmVersion: RECOMMENDATION_ALGORITHM };
  const withQuestions = input.topics.filter((t) => t.questionCount > 0);

  if (input.dueFlashcards > 0) {
    const n = Math.min(input.dueFlashcards, 20);
    return {
      ...base,
      type: 'review_flashcards',
      reasonCode: 'flashcards_due',
      title: `Revisar ${plural(n, 'flashcard', 'flashcards')}`,
      reason: 'Revisar no dia certo é o que fixa. Essas venceram hoje.',
      count: n,
    };
  }

  const soon = withQuestions
    .filter((t) => t.examInDays != null && t.examInDays >= 0 && t.examInDays <= 21)
    .sort(
      (a, b) =>
        a.examInDays! - b.examInDays! || (a.estimatedMastery ?? 0) - (b.estimatedMastery ?? 0),
    );
  const soonWeak = soon.find((t) => isWeak(t));
  if (soonWeak) {
    return {
      ...base,
      type: 'practice_topic',
      reasonCode: 'exam_soon_weak_topic',
      topicId: soonWeak.topicId,
      disciplineId: soonWeak.disciplineId,
      title: `Resolver ${size} questões de ${soonWeak.topicName}`,
      reason: `Sua prova de ${soonWeak.disciplineName} é em ${plural(soonWeak.examInDays!, 'dia', 'dias')} e este assunto está entre os seus erros recentes.`,
      count: size,
    };
  }
  const soonUnknown = soon.find((t) => t.confidence === 'insufficient');
  if (soonUnknown) {
    return {
      ...base,
      type: 'diagnostic',
      reasonCode: 'exam_soon_no_data',
      topicId: soonUnknown.topicId,
      disciplineId: soonUnknown.disciplineId,
      title: `Resolver ${size} questões de ${soonUnknown.topicName}`,
      reason: `Sua prova de ${soonUnknown.disciplineName} é em ${plural(soonUnknown.examInDays!, 'dia', 'dias')} e ainda não sabemos como você está neste assunto.`,
      count: size,
    };
  }

  const byDiscipline = new Map<string, TopicInput[]>();
  for (const t of withQuestions)
    byDiscipline.set(t.disciplineId, [...(byDiscipline.get(t.disciplineId) ?? []), t]);
  for (const [, topics] of byDiscipline) {
    if (topics.every((t) => t.attemptCount === 0)) {
      const first = topics[0]!;
      return {
        ...base,
        type: 'diagnostic',
        reasonCode: 'no_diagnostic',
        disciplineId: first.disciplineId,
        title: `Diagnóstico rápido de ${first.disciplineName}`,
        reason: 'Algumas questões mostram por onde começar. Você pode pular quando quiser.',
        count: size,
      };
    }
  }

  const weak = withQuestions
    .filter((t) => isWeak(t))
    .sort((a, b) => (a.estimatedMastery ?? 1) - (b.estimatedMastery ?? 1));
  if (weak[0]) {
    return {
      ...base,
      type: 'practice_topic',
      reasonCode: 'weak_topic',
      topicId: weak[0].topicId,
      disciplineId: weak[0].disciplineId,
      title: `Resolver ${size} questões de ${weak[0].topicName}`,
      reason: 'É o assunto em que você mais errou nas últimas semanas.',
      count: size,
    };
  }

  const least = [...withQuestions].sort((a, b) => a.attemptCount - b.attemptCount)[0];
  if (least) {
    return {
      ...base,
      type: 'explore',
      reasonCode: 'least_practiced',
      topicId: least.topicId,
      disciplineId: least.disciplineId,
      title: `Resolver ${size} questões de ${least.topicName}`,
      reason: 'É o assunto das suas disciplinas que você menos praticou até agora.',
      count: size,
    };
  }

  return {
    ...base,
    type: 'empty',
    reasonCode: 'no_content',
    title: 'Ainda não há questões publicadas nas suas disciplinas',
    reason: 'Assim que o conteúdo for revisado e publicado, ele aparece aqui.',
    count: 0,
  };
}
