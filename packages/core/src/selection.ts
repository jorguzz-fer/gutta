import type { Confidence } from './mastery';

/*
  Seleção da próxima questão V1. Regras, em ordem:
  1. nunca repetir questão já respondida nesta sessão;
  2. preferir questão nunca respondida; depois, as respondidas há mais tempo
     (as erradas voltam depois de 1 dia, as certas depois de 7);
  3. dificuldade perto do alvo do aluno naquele assunto;
  4. evitar dois seguidos do mesmo assunto quando houver alternativa (diversificar).
*/
export const SELECTION_ALGORITHM = 'selection-v1-2026-11';

export type Candidate = { id: string; topicId: string; difficulty: number };
export type History = Map<string, { lastAnsweredAt: Date; lastCorrect: boolean }>;
export type TopicState = { estimatedMastery: number | null; confidence: Confidence };

export function targetDifficulty(state: TopicState | undefined): number {
  if (!state || state.estimatedMastery === null || state.confidence === 'insufficient') return 2;
  if (state.estimatedMastery < 0.4) return 1.5;
  if (state.estimatedMastery < 0.6) return 2;
  if (state.estimatedMastery < 0.8) return 3;
  return 4;
}

function score(
  c: Candidate,
  ctx: { history: History; mastery: Map<string, TopicState>; lastTopicId?: string; now: Date },
  hasAlternativeTopic: boolean,
): number {
  let s = 0;
  const h = ctx.history.get(c.id);
  if (!h) s += 100;
  else {
    const days = (ctx.now.getTime() - h.lastAnsweredAt.getTime()) / 86_400_000;
    const cooldown = h.lastCorrect ? 7 : 1;
    if (days < cooldown) s -= 200;
    else s += Math.min(60, days * (h.lastCorrect ? 2 : 8));
  }
  s -= Math.abs(c.difficulty - targetDifficulty(ctx.mastery.get(c.topicId))) * 10;
  if (hasAlternativeTopic && c.topicId === ctx.lastTopicId) s -= 25;
  return s;
}

export function selectNextQuestion(
  candidates: Candidate[],
  ctx: {
    answeredInSession: Set<string>;
    history: History;
    mastery: Map<string, TopicState>;
    lastTopicId?: string;
    now: Date;
    random?: () => number;
  },
): Candidate | null {
  const pool = candidates.filter((c) => !ctx.answeredInSession.has(c.id));
  if (pool.length === 0) return null;
  const hasAlternativeTopic = pool.some((c) => c.topicId !== ctx.lastTopicId);
  const rnd = ctx.random ?? Math.random;
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    // Desempate aleatório pequeno, para a ordem não ficar sempre igual.
    const sc = score(c, ctx, hasAlternativeTopic) + rnd() * 5;
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return best;
}

/** Questão do dia: a mesma o dia todo para o aluno, sorteada entre as que ele ainda não fez. */
export function questionOfTheDay(
  publishedIds: string[],
  answered: Set<string>,
  dayKey: string,
  studentId: string,
): string | null {
  if (publishedIds.length === 0) return null;
  const sorted = [...publishedIds].sort();
  const fresh = sorted.filter((id) => !answered.has(id));
  const pool = fresh.length ? fresh : sorted;
  return pool[hash(`${studentId}:${dayKey}`) % pool.length]!;
}

/** FNV-1a 32 bits: estável entre execuções e plataformas. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
