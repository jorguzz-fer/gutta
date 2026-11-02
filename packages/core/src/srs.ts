import { localDayKey, zonedTimeToUtc } from './time';

/*
  Revisão espaçada V1, inspirada no SM-2 (SPEC FC-01). Documentada aqui e coberta por testes;
  não prometemos ao aluno um algoritmo específico até validar com dados do piloto.

  Notas: esqueci (0), difícil (1), bom (2), fácil (3).
  - esqueci: volta em 10 minutos, ainda hoje; zera a sequência e baixa a facilidade em 0,2;
  - difícil: intervalo × 1,2 (mínimo 1 dia); facilidade −0,15;
  - bom: 1 dia, depois 4, depois intervalo × facilidade;
  - fácil: 4 dias, depois intervalo × facilidade × 1,3; facilidade +0,15.
  Facilidade entre 1,3 e 3,0; intervalo máximo de 365 dias.
  Vencimentos de dias caem às 4h locais do dia de destino: o cartão aparece logo cedo,
  e "vence hoje" segue o calendário do aluno, não o UTC.
*/
export const SRS_ALGORITHM = 'srs-sm2ish-v1-2026-11';

export type Rating = 0 | 1 | 2 | 3;
export const RATING_LABEL: Record<Rating, string> = {
  0: 'Esqueci',
  1: 'Difícil',
  2: 'Bom',
  3: 'Fácil',
};

export type SrsState = { repetitions: number; intervalDays: number; ease: number; lapses: number };
export type SrsResult = SrsState & { dueAt: Date };

export const NEW_CARD: SrsState = { repetitions: 0, intervalDays: 0, ease: 2.5, lapses: 0 };
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL = 365;
const RELEARN_MINUTES = 10;
const DUE_HOUR = 4;

const clampEase = (e: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;

export function addLocalDays(now: Date, days: number, tz: string, hour = DUE_HOUR): Date {
  const today = localDayKey(now, tz);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return zonedTimeToUtc(target.toISOString().slice(0, 10), tz, hour);
}

export function schedule(state: SrsState, rating: Rating, now: Date, tz: string): SrsResult {
  if (rating === 0) {
    return {
      repetitions: 0,
      intervalDays: 0,
      ease: clampEase(state.ease - 0.2),
      lapses: state.lapses + 1,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
    };
  }
  let interval: number;
  let ease = state.ease;
  if (rating === 1) {
    interval = Math.max(1, Math.round(state.intervalDays * 1.2));
    ease -= 0.15;
  } else if (rating === 2) {
    interval =
      state.repetitions === 0
        ? 1
        : state.repetitions === 1
          ? 4
          : Math.round(state.intervalDays * state.ease);
  } else {
    interval =
      state.repetitions === 0 ? 4 : Math.round(Math.max(1, state.intervalDays) * state.ease * 1.3);
    ease += 0.15;
  }
  interval = Math.min(MAX_INTERVAL, Math.max(1, interval));
  return {
    repetitions: state.repetitions + 1,
    intervalDays: interval,
    ease: clampEase(ease),
    lapses: state.lapses,
    dueAt: addLocalDays(now, interval, tz),
  };
}

/** Prévia de cada botão ("Bom · 4 dias"), para o aluno saber o que acontece antes de escolher. */
export function previewIntervals(state: SrsState, now: Date, tz: string): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of [0, 1, 2, 3] as Rating[]) {
    const res = schedule(state, r, now, tz);
    out[r] =
      r === 0
        ? `${RELEARN_MINUTES} min`
        : res.intervalDays === 1
          ? '1 dia'
          : `${res.intervalDays} dias`;
  }
  return out;
}
