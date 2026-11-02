/*
  Estimativa de domínio V1 (SPEC QUE-02). Heurística transparente, não avaliação psicométrica:
  - acertos recentes pesam mais (meia-vida de 14 dias);
  - acertar questão difícil pesa um pouco mais que acertar fácil;
  - amostra pequena é puxada para 50% (prior com 2 tentativas "fantasma") e,
    abaixo de 3 tentativas, não devolvemos número nenhum: "sem diagnóstico".
*/
export const MASTERY_ALGORITHM = 'mastery-v1-2026-11';

export type AttemptSample = { isCorrect: boolean; difficulty: number; answeredAt: Date };
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';
export type MasteryEstimate = {
  attemptCount: number;
  correctCount: number;
  estimatedMastery: number | null;
  confidence: Confidence;
  lastAttemptAt: Date | null;
};

const HALF_LIFE_DAYS = 14;
const PRIOR_WEIGHT = 2;
const PRIOR_MEAN = 0.5;

export function confidenceFor(n: number): Confidence {
  if (n < 3) return 'insufficient';
  if (n < 6) return 'low';
  if (n < 12) return 'medium';
  return 'high';
}

export function estimateMastery(attempts: AttemptSample[], now: Date): MasteryEstimate {
  const n = attempts.length;
  const correctCount = attempts.filter((a) => a.isCorrect).length;
  const last = attempts.reduce<Date | null>(
    (m, a) => (!m || a.answeredAt > m ? a.answeredAt : m),
    null,
  );
  if (n < 3) {
    return {
      attemptCount: n,
      correctCount,
      estimatedMastery: null,
      confidence: 'insufficient',
      lastAttemptAt: last,
    };
  }
  let num = PRIOR_WEIGHT * PRIOR_MEAN;
  let den = PRIOR_WEIGHT;
  for (const a of attempts) {
    const ageDays = Math.max(0, (now.getTime() - a.answeredAt.getTime()) / 86_400_000);
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const d = Math.min(5, Math.max(1, a.difficulty));
    // Acerto em difícil vale mais (0,875 a 1,375); erro em fácil pesa mais (1,125 a 1,625).
    const weight = recency * (a.isCorrect ? 0.75 + 0.125 * d : 1.75 - 0.125 * d);
    num += weight * (a.isCorrect ? 1 : 0);
    den += weight;
  }
  const value = Math.round((num / den) * 1000) / 1000;
  return {
    attemptCount: n,
    correctCount,
    estimatedMastery: value,
    confidence: confidenceFor(n),
    lastAttemptAt: last,
  };
}

export type MasteryBand = 'sem_diagnostico' | 'comecando' | 'fragil' | 'em_construcao' | 'firme';

/** Faixa para exibir ao aluno. Sem porcentagem: a precisão não existe com tão poucos dados. */
export function masteryBand(
  m: Pick<MasteryEstimate, 'estimatedMastery' | 'confidence'> | null | undefined,
): MasteryBand {
  if (!m || m.estimatedMastery === null || m.confidence === 'insufficient')
    return 'sem_diagnostico';
  if (m.confidence === 'low') return 'comecando';
  if (m.estimatedMastery < 0.5) return 'fragil';
  if (m.estimatedMastery < 0.75) return 'em_construcao';
  return 'firme';
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  sem_diagnostico: 'Sem diagnóstico',
  comecando: 'Começando',
  fragil: 'Frágil',
  em_construcao: 'Em construção',
  firme: 'Firme',
};

/** Assunto "fraco" para fins de recomendação. */
export function isWeak(
  m: Pick<MasteryEstimate, 'estimatedMastery' | 'confidence'> | null | undefined,
) {
  return Boolean(
    m && m.estimatedMastery !== null && m.confidence !== 'insufficient' && m.estimatedMastery < 0.6,
  );
}
