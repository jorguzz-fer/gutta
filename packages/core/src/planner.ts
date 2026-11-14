// Motor do Equilíbrio (SPEC v2, 5.4 e 7.5; parâmetros da seção 6.4, decisão D15).
// Algoritmo determinístico, sem I/O e sem modelo de linguagem: as regras R01 a R07 são
// garantias, e garantia se prova com teste (planner.test.ts). A proposta só vira agenda depois
// da confirmação do aluno (R10); aqui só se calcula.
//
// Tempos em milissegundos desde a época (UTC). O fuso entra para saber o dia e o período local.

import { localDayKey } from './time';
import { localMinute } from './notify';

export const PLANNER_VERSION = 'equilibrio-1';

export type Interval = { start: number; end: number };

export type Intensity = 'leve' | 'equilibrada' | 'intensiva';
export type Period = 'manha' | 'tarde' | 'noite' | 'varia';
export type PlanPriority = 'bem_estar' | 'avaliacoes' | 'dificuldade' | 'distribuicao';
export type TaskOrigin = 'aula' | 'falta' | 'prova' | 'nota' | 'aluno' | 'memory';

export type PlannerPreferences = {
  /** Duração da sessão (EQU-01): 20, 30, 45 ou 60 minutos. */
  sessionMinutes: number;
  /** Pausa entre sessões seguidas (EQU-03): 5 a 10 minutos. */
  breakMinutes: number;
  /** No máximo quantas sessões seguidas antes de uma pausa maior (EQU-03). */
  maxConsecutive: number;
  /** Pausa maior depois da sequência. */
  longBreakMinutes: number;
  intensity: Intensity;
  preferredPeriod: Period;
  priority: PlanPriority;
  /** Limites de estudo extraclasse (EQU-02). Null: sem limite próprio. */
  dailyLimitMinutes: number | null;
  weeklyLimitMinutes: number | null;
  /** Evitar sessão logo depois de jornada acadêmica longa (EQU-03, 6.4), salvo preferência. */
  avoidAfterLongJourney: boolean;
};

export const DEFAULT_PREFERENCES: PlannerPreferences = {
  sessionMinutes: 30,
  breakMinutes: 10,
  maxConsecutive: 2,
  longBreakMinutes: 30,
  intensity: 'equilibrada',
  preferredPeriod: 'varia',
  priority: 'bem_estar',
  dailyLimitMinutes: null,
  weeklyLimitMinutes: null,
  avoidAfterLongJourney: true,
};

/** Ocupação por intensidade (6.4, D15): fração das janelas de estudo declaradas. */
export const OCCUPANCY: Record<Intensity, number> = {
  leve: 0.5,
  equilibrada: 0.75,
  intensiva: 1,
};

/** Jornada acadêmica longa (6.4, D15): quatro ou mais horas-aula seguidas. */
export const LONG_JOURNEY_MINUTES = 4 * 60;
/** Intervalo depois da jornada longa em que não se propõe sessão. */
export const LONG_JOURNEY_REST_MINUTES = 60;
/** Aulas com até este intervalo entre si contam como seguidas. */
const JOURNEY_GAP_MINUTES = 20;

export type PlannerTask = {
  id: string;
  disciplineId: string | null;
  /** Minutos que ainda faltam (a tarefa longa é dividida em etapas, EQU-05). */
  remainingMinutes: number;
  /** Prazo (a prova, por exemplo). A sessão precisa terminar antes. */
  dueAt: number | null;
  difficulty: 'facil' | 'moderado' | 'dificil' | null;
  importance: 'nenhuma' | 'importante' | 'alta' | null;
  origin: TaskOrigin;
};

export type PlannerInput = {
  tz: string;
  /** Período planejado: em geral a semana, a partir de agora. */
  from: number;
  to: number;
  /** Janelas de estudo autorizadas (ROT-08). Fora delas, nada (R01 a R03). */
  studyWindows: Interval[];
  /** Tudo o que é protegido: aulas, compromissos, pessoal (R01 a R03) e sessões já marcadas. */
  busy: Interval[];
  /** Aulas (para a regra da jornada longa). Também precisam estar em `busy`. */
  classes: Interval[];
  /** Sessões confirmadas no período: ocupam horário e contam nos limites. */
  confirmed: Interval[];
  prefs: PlannerPreferences;
  tasks: PlannerTask[];
  /** "Pedir outro plano" (EQU-07): muda o desempate de forma reproduzível. */
  variant?: number;
  /** Replanejar (EQU-12): o total proposto não passa disto (nunca aumenta a semana sozinho). */
  maxTotalMinutes?: number;
};

export type ReasonCode =
  | 'prova_proxima'
  | 'prazo_proximo'
  | 'dificil'
  | 'importante'
  | 'origem_aula'
  | 'origem_falta'
  | 'origem_nota'
  | 'origem_aluno'
  | 'origem_memory'
  | 'periodo_preferido';

export type ProposedSession = {
  taskId: string;
  start: number;
  end: number;
  minutes: number;
  /** Etapa desta tarefa na proposta (1 de 3). */
  part: number;
  parts: number;
  reasons: ReasonCode[];
};

/**
 * prazo: nenhum horário livre antes do prazo; limite_diario e limite_semanal: os limites do
 * aluno; intensidade: a ocupação da intensidade escolhida (6.4) deixa o resto das janelas livre;
 * sem_horario: as janelas acabaram.
 */
export type UnplacedReason =
  'prazo' | 'limite_diario' | 'limite_semanal' | 'intensidade' | 'sem_horario';

export type Unplaced = {
  taskId: string;
  minutes: number;
  reason: UnplacedReason;
  /** Prioridade da tarefa: maior, mais vale encaixar em vez de outra (EQU-09). */
  score: number;
};

export type PlannerOutput = {
  version: string;
  sessions: ProposedSession[];
  unplaced: Unplaced[];
  /** Indicadores (EQU-10): janelas declaradas, o que a intensidade usa e o proposto. */
  capacity: { windowMinutes: number; usableMinutes: number; proposedMinutes: number };
};

const MIN = 60_000;

// -------------------------------------------------------------------------------------------
// Intervalos

/** Une intervalos que se sobrepõem ou se tocam, em ordem. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** O que sobra de `base` depois de tirar `cut`. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const c = mergeIntervals(cut);
  const out: Interval[] = [];
  for (const b of mergeIntervals(base)) {
    let cur = b.start;
    for (const x of c) {
      if (x.end <= cur || x.start >= b.end) continue;
      if (x.start > cur) out.push({ start: cur, end: x.start });
      cur = Math.max(cur, x.end);
      if (cur >= b.end) break;
    }
    if (cur < b.end) out.push({ start: cur, end: b.end });
  }
  return out;
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

const clip = (list: Interval[], from: number, to: number) =>
  list
    .map((i) => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter((i) => i.end > i.start);

const minutes = (list: Interval[]) =>
  list.reduce((n, i) => n + Math.round((i.end - i.start) / MIN), 0);

/**
 * Intervalos logo depois de uma jornada acadêmica longa (6.4): aulas seguidas (com até 20 min
 * entre elas) que somam quatro horas ou mais. Nesses intervalos não se propõe sessão.
 */
export function afterLongJourneys(classes: Interval[]): Interval[] {
  const sorted = classes.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const runs: { start: number; end: number; minutes: number }[] = [];
  for (const c of sorted) {
    const last = runs[runs.length - 1];
    if (last && c.start - last.end <= JOURNEY_GAP_MINUTES * MIN) {
      last.minutes += (c.end - Math.max(c.start, last.end)) / MIN;
      last.end = Math.max(last.end, c.end);
    } else runs.push({ start: c.start, end: c.end, minutes: (c.end - c.start) / MIN });
  }
  return runs
    .filter((r) => r.minutes >= LONG_JOURNEY_MINUTES)
    .map((r) => ({ start: r.end, end: r.end + LONG_JOURNEY_REST_MINUTES * MIN }));
}

// -------------------------------------------------------------------------------------------
// Passo 1: horários possíveis

type Slot = Interval & { day: string; period: Exclude<Period, 'varia'> };

function periodOf(ms: number, tz: string): Exclude<Period, 'varia'> {
  const m = localMinute(new Date(ms), tz);
  if (m < 12 * 60) return 'manha';
  if (m < 18 * 60) return 'tarde';
  return 'noite';
}

/**
 * Divide o tempo livre das janelas em sessões da duração preferida, com pausa entre sessões
 * seguidas e uma pausa maior depois de `maxConsecutive` (R04, R06, EQU-03). Qualquer
 * subconjunto destes horários respeita as pausas.
 */
function buildSlots(free: Interval[], p: PlannerPreferences, tz: string): Slot[] {
  const len = p.sessionMinutes * MIN;
  const out: Slot[] = [];
  for (const f of free) {
    let t = f.start;
    let streak = 0;
    while (t + len <= f.end) {
      out.push({
        start: t,
        end: t + len,
        day: localDayKey(new Date(t), tz),
        period: periodOf(t, tz),
      });
      streak++;
      if (streak >= Math.max(1, p.maxConsecutive)) {
        t += len + p.longBreakMinutes * MIN;
        streak = 0;
      } else t += len + p.breakMinutes * MIN;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// -------------------------------------------------------------------------------------------
// Passo 2: pontuação (EQU-05)

const DIFF = { facil: 0, moderado: 1, dificil: 2 } as const;
const IMP = { nenhuma: 0, importante: 2, alta: 3 } as const;

/**
 * Prioridade pelos fatores do EQU-05: proximidade do prazo, dificuldade, importância e o
 * tamanho (tarefa maior começa antes). A preferência de prioridade do aluno pesa um fator.
 */
export function taskScore(t: PlannerTask, now: number, priority: PlanPriority): number {
  const days = t.dueAt === null ? null : (t.dueAt - now) / (24 * 60 * MIN);
  const due = days === null ? 0 : Math.max(0, 14 - Math.max(days, 0)) / 14; // 0 a 1
  const diff = t.difficulty ? DIFF[t.difficulty] / 2 : 0; // 0 a 1
  const imp = t.importance ? IMP[t.importance] / 3 : 0; // 0 a 1
  const size = Math.min(t.remainingMinutes, 240) / 240; // 0 a 1
  const w = {
    due: priority === 'avaliacoes' ? 6 : 4,
    diff: priority === 'dificuldade' ? 4 : 2,
    imp: 2,
    size: 0.5,
  };
  const origin = t.origin === 'prova' ? 1 : t.origin === 'falta' || t.origin === 'aula' ? 0.5 : 0;
  return (
    Math.round((w.due * due + w.diff * diff + w.imp * imp + w.size * size + origin) * 100) / 100
  );
}

function reasonsFor(t: PlannerTask, now: number, slot: Slot, p: PlannerPreferences): ReasonCode[] {
  const r: ReasonCode[] = [];
  const week = 7 * 24 * 60 * MIN;
  if (t.origin === 'prova') r.push('prova_proxima');
  else if (t.dueAt !== null && t.dueAt - now <= week) r.push('prazo_proximo');
  if (t.difficulty === 'dificil') r.push('dificil');
  if (t.importance === 'importante' || t.importance === 'alta') r.push('importante');
  if (t.origin !== 'prova') r.push(`origem_${t.origin}` as ReasonCode);
  if (p.preferredPeriod !== 'varia' && slot.period === p.preferredPeriod)
    r.push('periodo_preferido');
  return r;
}

// Desempate reproduzível: hash simples do id com a variante (EQU-07, "pedir outro plano").
function tieKey(id: string, variant: number): number {
  let h = 2166136261 ^ variant;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pausas e sequência (R06, EQU-03) contando as sessões já escolhidas e as confirmadas. Duas
 * sessões com algo protegido entre elas (aula, compromisso, pessoal) não são "seguidas".
 */
function fitsRhythm(
  cand: Interval,
  study: Interval[],
  busy: Interval[],
  p: PlannerPreferences,
): boolean {
  const between = (a: Interval, b: Interval) =>
    busy.some((x) => x.start >= a.end && x.end <= b.start);
  const all = [...study, cand].sort((a, b) => a.start - b.start);
  const i = all.indexOf(cand);
  const prev = all[i - 1];
  const next = all[i + 1];
  if (prev && !between(prev, cand) && cand.start - prev.end < p.breakMinutes * MIN) return false;
  if (next && !between(cand, next) && next.start - cand.end < p.breakMinutes * MIN) return false;
  // Tamanho da sequência que contém o candidato.
  const linked = (a: Interval, b: Interval) =>
    !between(a, b) && b.start - a.end < p.longBreakMinutes * MIN;
  let run = 1;
  for (let k = i; k > 0 && linked(all[k - 1]!, all[k]!); k--) run++;
  for (let k = i; k + 1 < all.length && linked(all[k]!, all[k + 1]!); k++) run++;
  return run <= Math.max(1, p.maxConsecutive);
}

// -------------------------------------------------------------------------------------------
// O plano

export function planWeek(input: PlannerInput): PlannerOutput {
  const p = input.prefs;
  const variant = input.variant ?? 0;
  const now = input.from;
  const windows = clip(mergeIntervals(input.studyWindows), input.from, input.to);
  const windowMinutes = minutes(windows);

  // Passo 1: horário livre dentro das janelas, sem nada protegido nem já marcado.
  const blocked = [
    ...input.busy,
    ...input.confirmed,
    ...(p.avoidAfterLongJourney ? afterLongJourneys(input.classes) : []),
  ];
  const free = subtractIntervals(windows, blocked);
  const slots = buildSlots(free, p, input.tz);

  // Limites: o menor entre o do aluno e a ocupação por intensidade (6.4), descontando o que já
  // está confirmado. O replanejamento ainda limita pelo total que tinha.
  const confirmedMin = minutes(clip(input.confirmed, input.from, input.to));
  const byIntensity = Math.floor(windowMinutes * OCCUPANCY[p.intensity]);
  const weekCaps = [byIntensity, p.weeklyLimitMinutes ?? Infinity];
  let weekLeft = Math.min(...weekCaps) - confirmedMin;
  if (input.maxTotalMinutes !== undefined) weekLeft = Math.min(weekLeft, input.maxTotalMinutes);
  weekLeft = Math.max(0, weekLeft);
  // Quem limita a semana: o aluno (limite ou replanejamento) ou a intensidade.
  const weekReason: UnplacedReason =
    input.maxTotalMinutes !== undefined ||
    (p.weeklyLimitMinutes !== null && p.weeklyLimitMinutes < byIntensity)
      ? 'limite_semanal'
      : 'intensidade';
  const usableMinutes = weekLeft;

  const dayUsed = new Map<string, number>();
  for (const c of clip(input.confirmed, input.from, input.to)) {
    const d = localDayKey(new Date(c.start), input.tz);
    dayUsed.set(d, (dayUsed.get(d) ?? 0) + Math.round((c.end - c.start) / MIN));
  }

  // Passo 2: tarefas em etapas do tamanho da sessão.
  const tasks = input.tasks
    .filter((t) => t.remainingMinutes > 0)
    .map((t) => ({
      t,
      score: taskScore(t, now, p.priority),
      tie: tieKey(t.id, variant),
      parts: [] as number[],
      placed: 0,
    }));
  for (const x of tasks) {
    let left = x.t.remainingMinutes;
    while (left > 0) {
      const m = Math.min(left, p.sessionMinutes);
      x.parts.push(m);
      left -= m;
    }
  }

  // Passo 3: encaixe guloso. A cada rodada, a etapa da tarefa de maior prioridade efetiva vai
  // para o melhor horário viável. A prioridade cai um pouco a cada etapa encaixada e por
  // disciplina, para equilibrar (R08, EQU-05).
  const used = new Set<number>();
  const study: Interval[] = clip(
    input.confirmed,
    input.from - 24 * 60 * MIN,
    input.to + 24 * 60 * MIN,
  );
  const perDiscipline = new Map<string, number>();
  const sessions: ProposedSession[] = [];
  const failure = new Map<string, UnplacedReason>();
  const pending = new Set(tasks.map((_, i) => i));
  const discWeight = p.priority === 'distribuicao' ? 1.5 : 0.6;
  const spread = p.priority === 'bem_estar' || p.priority === 'distribuicao';

  while (pending.size && weekLeft > 0) {
    let best = -1;
    let bestVal = -Infinity;
    let bestTie = 0;
    for (const i of pending) {
      const x = tasks[i]!;
      const val =
        x.score - 1.2 * x.placed - discWeight * (perDiscipline.get(x.t.disciplineId ?? '') ?? 0);
      if (val > bestVal || (val === bestVal && x.tie < bestTie)) {
        best = i;
        bestVal = val;
        bestTie = x.tie;
      }
    }
    const x = tasks[best]!;
    const need = x.parts[x.placed]!;

    let chosen = -1;
    let chosenKey: [number, number, number, number] | null = null;
    let reason: UnplacedReason = 'sem_horario';
    for (let k = 0; k < slots.length; k++) {
      if (used.has(k)) continue;
      const s = slots[k]!;
      if (x.t.dueAt !== null && s.start + need * MIN > x.t.dueAt) {
        if (reason === 'sem_horario') reason = 'prazo';
        continue;
      }
      if (need > weekLeft) {
        reason = weekReason;
        continue;
      }
      if (p.dailyLimitMinutes !== null && (dayUsed.get(s.day) ?? 0) + need > p.dailyLimitMinutes) {
        if (reason !== weekReason) reason = 'limite_diario';
        continue;
      }
      if (!fitsRhythm({ start: s.start, end: s.start + need * MIN }, study, input.busy, p))
        continue;
      // Melhor horário: período preferido para o difícil (R05), dia menos cheio (bem-estar e
      // distribuição), mais cedo antes do prazo; o desempate muda com a variante.
      // O difícil, que tem prioridade maior, chega antes aos horários preferidos.
      const periodPenalty = p.preferredPeriod !== 'varia' && s.period !== p.preferredPeriod ? 1 : 0;
      const load = spread ? (dayUsed.get(s.day) ?? 0) : 0;
      const key: [number, number, number, number] = [
        periodPenalty,
        load,
        variant ? tieKey(String(s.start), variant) : 0,
        s.start,
      ];
      if (!chosenKey || cmp(key, chosenKey) < 0) {
        chosen = k;
        chosenKey = key;
      }
    }

    if (chosen < 0) {
      // Esta tarefa não cabe mais: o resto dela fica de fora (EQU-09).
      failure.set(x.t.id, reason);
      pending.delete(best);
      continue;
    }
    const s = slots[chosen]!;
    used.add(chosen);
    study.push({ start: s.start, end: s.start + need * MIN });
    sessions.push({
      taskId: x.t.id,
      start: s.start,
      end: s.start + need * MIN,
      minutes: need,
      part: x.placed + 1,
      parts: x.parts.length,
      reasons: reasonsFor(x.t, now, s, p),
    });
    dayUsed.set(s.day, (dayUsed.get(s.day) ?? 0) + need);
    weekLeft -= need;
    x.placed++;
    const d = x.t.disciplineId ?? '';
    perDiscipline.set(d, (perDiscipline.get(d) ?? 0) + 1);
    if (x.placed >= x.parts.length) pending.delete(best);
  }

  // Passo 4: o que não coube, com o motivo e a prioridade (EQU-09).
  const unplaced: Unplaced[] = [];
  for (const x of tasks) {
    const rest = x.parts.slice(x.placed).reduce((n, m) => n + m, 0);
    if (rest <= 0) continue;
    const reason = failure.get(x.t.id) ?? weekReason;
    unplaced.push({ taskId: x.t.id, minutes: rest, reason, score: x.score });
  }
  unplaced.sort((a, b) => b.score - a.score);

  // Passo 5: em ordem de horário, com o número de cada etapa.
  sessions.sort((a, b) => a.start - b.start);
  const seen = new Map<string, number>();
  for (const s of sessions) {
    const n = (seen.get(s.taskId) ?? 0) + 1;
    seen.set(s.taskId, n);
    s.part = n;
  }
  return {
    version: PLANNER_VERSION,
    sessions,
    unplaced,
    capacity: {
      windowMinutes,
      usableMinutes,
      proposedMinutes: sessions.reduce((n, s) => n + s.minutes, 0),
    },
  };
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

// -------------------------------------------------------------------------------------------
// "Minha semana está equilibrada?" (EQU-16; semana intensa da seção 6.4, D15)

export type WeekBalance = 'equilibrada' | 'intensa' | 'revisar';

/** Limiar padrão de aulas e compromissos na semana para "semana intensa" (configurável). */
export const INTENSE_WEEK_MINUTES = 40 * 60;

export function weekBalance(input: {
  /** Avaliações dos próximos dias, em ms. */
  assessments: number[];
  /** Minutos de aulas e compromissos na semana. */
  busyMinutes: number;
  /** Há tarefa que não coube ou sessão sobreposta. */
  needsReview: boolean;
  thresholdMinutes?: number;
}): WeekBalance {
  if (input.needsReview) return 'revisar';
  const sorted = [...input.assessments].sort((a, b) => a - b);
  const week = 7 * 24 * 60 * MIN;
  for (let i = 0; i + 1 < sorted.length; i++)
    if (sorted[i + 1]! - sorted[i]! < week) return 'intensa';
  if (input.busyMinutes > (input.thresholdMinutes ?? INTENSE_WEEK_MINUTES)) return 'intensa';
  return 'equilibrada';
}
