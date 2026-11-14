import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  OCCUPANCY,
  afterLongJourneys,
  mergeIntervals,
  overlaps,
  planWeek,
  subtractIntervals,
  weekBalance,
  type Interval,
  type PlannerInput,
  type PlannerPreferences,
  type PlannerTask,
} from './planner';
import { localDayKey, zonedTimeToUtc } from './time';
import { addDays } from './recurrence';

// Motor do Equilíbrio (SPEC v2, 7.5). Os critérios 1 a 5 e 7 do EQU viram propriedades sobre
// entradas geradas: nada em bloco protegido, sem sobreposição, limites, só janela de estudo,
// mesma entrada e mesma saída, replanejar nunca aumenta a semana.

const TZ = 'America/Sao_Paulo';
const MONDAY = '2026-11-16';
const MIN = 60_000;
const at = (day: string, h: number, m = 0) => zonedTimeToUtc(day, TZ, h, m).getTime();
const iv = (day: string, h1: number, m1: number, h2: number, m2: number): Interval => ({
  start: at(day, h1, m1),
  end: at(day, h2, m2),
});

// Gerador reproduzível (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(seed: number): PlannerInput {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
  const studyWindows: Interval[] = [];
  const classes: Interval[] = [];
  const personal: Interval[] = [];
  for (let d = 0; d < 7; d++) {
    const day = addDays(MONDAY, d);
    for (let k = int(0, 3); k > 0; k--) {
      const h = int(6, 21);
      const len = pick([30, 45, 60, 90, 120, 180]);
      const s = at(day, h, pick([0, 15, 30]));
      studyWindows.push({ start: s, end: s + len * MIN });
    }
    if (d < 5)
      for (let k = int(0, 4); k > 0; k--) {
        const s = at(day, int(7, 17), pick([0, 30]));
        classes.push({ start: s, end: s + pick([50, 60, 100, 120]) * MIN });
      }
    for (let k = int(0, 2); k > 0; k--) {
      const s = at(day, int(6, 22), 0);
      personal.push({ start: s, end: s + pick([30, 60, 90]) * MIN });
    }
  }
  const confirmed: Interval[] = [];
  for (let k = int(0, 3); k > 0; k--) {
    const w = studyWindows[int(0, Math.max(0, studyWindows.length - 1))];
    if (w) confirmed.push({ start: w.start, end: Math.min(w.end, w.start + 30 * MIN) });
  }
  const prefs: PlannerPreferences = {
    sessionMinutes: pick([20, 30, 45, 60]),
    breakMinutes: int(5, 10),
    maxConsecutive: int(1, 3),
    longBreakMinutes: pick([20, 30, 45]),
    intensity: pick(['leve', 'equilibrada', 'intensiva'] as const),
    preferredPeriod: pick(['manha', 'tarde', 'noite', 'varia'] as const),
    priority: pick(['bem_estar', 'avaliacoes', 'dificuldade', 'distribuicao'] as const),
    dailyLimitMinutes: r() < 0.5 ? null : pick([30, 60, 90, 120, 180]),
    weeklyLimitMinutes: r() < 0.5 ? null : pick([60, 120, 300, 600]),
    avoidAfterLongJourney: r() < 0.8,
  };
  const tasks: PlannerTask[] = Array.from({ length: int(0, 8) }, (_, i) => ({
    id: `t${seed}-${i}`,
    disciplineId: pick(['bmf', 'pato', 'anato', null]),
    remainingMinutes: pick([20, 30, 45, 60, 90, 120, 240]),
    dueAt: r() < 0.4 ? null : at(addDays(MONDAY, int(0, 9)), int(7, 20)),
    difficulty: pick(['facil', 'moderado', 'dificil', null] as const),
    importance: pick(['nenhuma', 'importante', 'alta', null] as const),
    origin: pick(['aula', 'falta', 'prova', 'nota', 'aluno', 'memory'] as const),
  }));
  return {
    tz: TZ,
    from: at(MONDAY, int(0, 12)),
    to: at(addDays(MONDAY, 7), 0),
    studyWindows,
    busy: [...classes, ...personal],
    classes,
    confirmed,
    prefs,
    tasks,
    variant: int(0, 3),
  };
}

const CASES = 400;
const total = (list: { minutes: number }[]) => list.reduce((n, s) => n + s.minutes, 0);

describe('motor do Equilíbrio: propriedades (SPEC v2, 7.5)', { timeout: 60_000 }, () => {
  it('nada encosta em bloco protegido nem em sessão já confirmada (R01 a R03)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const { sessions } = planWeek(input);
      for (const s of sessions)
        for (const b of [...input.busy, ...input.confirmed])
          expect(overlaps(s, b), `semente ${seed}`).toBe(false);
    }
  });

  it('só dentro das janelas de estudo e do período (ROT-08, critério 1)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const windows = mergeIntervals(input.studyWindows);
      for (const s of planWeek(input).sessions) {
        expect(s.start).toBeGreaterThanOrEqual(input.from);
        expect(s.end).toBeLessThanOrEqual(input.to);
        expect(
          windows.some((w) => w.start <= s.start && s.end <= w.end),
          `semente ${seed}`,
        ).toBe(true);
      }
    }
  });

  it('sem sobreposição, com pausa e no máximo as sessões seguidas permitidas (R04, R06)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const p = input.prefs;
      const sessions = planWeek(input).sessions;
      for (let i = 1; i < sessions.length; i++)
        expect(sessions[i]!.start, `semente ${seed}`).toBeGreaterThanOrEqual(sessions[i - 1]!.end);
      // As confirmadas também contam na sequência.
      const list = [...sessions, ...input.confirmed].sort((a, b) => a.start - b.start);
      let streak = 1;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1]!;
        const b = list[i]!;
        const between = input.busy.some((x) => x.start >= a.end && x.end <= b.start);
        const gap = (b.start - a.end) / MIN;
        const proposed = sessions.includes(a as never) || sessions.includes(b as never);
        if (!between && proposed)
          expect(gap, `semente ${seed}`).toBeGreaterThanOrEqual(p.breakMinutes);
        streak = !between && gap < p.longBreakMinutes ? streak + 1 : 1;
        if (proposed)
          expect(streak, `semente ${seed}`).toBeLessThanOrEqual(Math.max(1, p.maxConsecutive));
      }
    }
  });

  it('limites diário e semanal, e a ocupação da intensidade (R07, 6.4, critério 4)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const p = input.prefs;
      const out = planWeek(input);
      const inRange = (i: Interval) => i.start >= input.from && i.end <= input.to;
      const confirmedMin = input.confirmed
        .filter(inRange)
        .reduce((n, c) => n + (c.end - c.start) / MIN, 0);
      const windows = mergeIntervals(input.studyWindows)
        .map((w) => ({ start: Math.max(w.start, input.from), end: Math.min(w.end, input.to) }))
        .filter((w) => w.end > w.start)
        .reduce((n, w) => n + Math.round((w.end - w.start) / MIN), 0);
      const cap = Math.min(
        Math.floor(windows * OCCUPANCY[p.intensity]),
        p.weeklyLimitMinutes ?? Infinity,
      );
      expect(total(out.sessions), `semente ${seed}`).toBeLessThanOrEqual(
        Math.max(0, cap - confirmedMin),
      );
      if (p.dailyLimitMinutes !== null) {
        const perDay = new Map<string, number>();
        for (const s of out.sessions) {
          const d = localDayKey(new Date(s.start), TZ);
          perDay.set(d, (perDay.get(d) ?? 0) + s.minutes);
        }
        for (const [day, m] of perDay) {
          const already = input.confirmed
            .filter((c) => inRange(c) && localDayKey(new Date(c.start), TZ) === day)
            .reduce((n, c) => n + (c.end - c.start) / MIN, 0);
          expect(m + already, `semente ${seed}`).toBeLessThanOrEqual(p.dailyLimitMinutes);
        }
      }
    }
  });

  it('prazo e tamanho de cada tarefa respeitados (critério 5)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const out = planWeek(input);
      for (const t of input.tasks) {
        const mine = out.sessions.filter((s) => s.taskId === t.id);
        const left = out.unplaced.find((u) => u.taskId === t.id)?.minutes ?? 0;
        expect(total(mine) + left, `semente ${seed}`).toBe(t.remainingMinutes);
        if (t.dueAt !== null) for (const s of mine) expect(s.end).toBeLessThanOrEqual(t.dueAt);
      }
    }
  });

  it('mesma entrada, mesma saída; outro plano também é reproduzível (EQU-07)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = randomInput(seed);
      expect(planWeek(input)).toEqual(planWeek(structuredClone(input)));
      const other = { ...input, variant: (input.variant ?? 0) + 1 };
      expect(planWeek(other)).toEqual(planWeek(structuredClone(other)));
    }
  });

  it('replanejar nunca aumenta o total da semana sozinho (critério 7)', () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const input = randomInput(seed);
      const before = total(planWeek(input).sessions);
      const budget = Math.floor(before * (seed % 3) * 0.5);
      const after = planWeek({ ...input, maxTotalMinutes: budget });
      expect(total(after.sessions), `semente ${seed}`).toBeLessThanOrEqual(budget);
    }
  });
});

describe('motor do Equilíbrio: exemplos', () => {
  const windows = [0, 1, 2, 3, 4].flatMap((d) => [
    iv(addDays(MONDAY, d), 8, 0, 10, 0),
    iv(addDays(MONDAY, d), 19, 0, 21, 0),
  ]);
  const base: PlannerInput = {
    tz: TZ,
    from: at(MONDAY, 0),
    to: at(addDays(MONDAY, 7), 0),
    studyWindows: windows,
    busy: [],
    classes: [],
    confirmed: [],
    prefs: { ...DEFAULT_PREFERENCES, intensity: 'intensiva' },
    tasks: [],
  };

  it('a prova de quinta vem antes; nada depois da prova; motivo explicado (R08, R11)', () => {
    const out = planWeek({
      ...base,
      tasks: [
        {
          id: 'leitura',
          disciplineId: 'anato',
          remainingMinutes: 60,
          dueAt: null,
          difficulty: null,
          importance: null,
          origin: 'aluno',
        },
        {
          id: 'prova-bmf',
          disciplineId: 'bmf',
          remainingMinutes: 90,
          dueAt: at(addDays(MONDAY, 3), 8),
          difficulty: 'dificil',
          importance: 'alta',
          origin: 'prova',
        },
      ],
    });
    expect(out.unplaced).toEqual([]);
    const first = out.sessions[0]!;
    expect(first.taskId).toBe('prova-bmf');
    expect(first.reasons).toEqual(expect.arrayContaining(['prova_proxima', 'dificil']));
    for (const s of out.sessions.filter((x) => x.taskId === 'prova-bmf'))
      expect(s.end).toBeLessThanOrEqual(at(addDays(MONDAY, 3), 8));
    // A tarefa de 90 min virou três sessões de 30 (R04).
    expect(out.sessions.filter((x) => x.taskId === 'prova-bmf').map((s) => s.minutes)).toEqual([
      30, 30, 30,
    ]);
  });

  it('difícil no período preferido (R05)', () => {
    const out = planWeek({
      ...base,
      prefs: { ...base.prefs, preferredPeriod: 'noite' },
      tasks: [
        {
          id: 'dificil',
          disciplineId: 'bmf',
          remainingMinutes: 30,
          dueAt: null,
          difficulty: 'dificil',
          importance: null,
          origin: 'aula',
        },
      ],
    });
    expect(out.sessions[0]!.reasons).toContain('periodo_preferido');
    expect(new Date(out.sessions[0]!.start).getUTCHours()).toBe(22); // 19h em São Paulo
  });

  it('o que não cabe aparece com o motivo, sem sessão fora do autorizado (EQU-09)', () => {
    const out = planWeek({
      ...base,
      prefs: { ...base.prefs, intensity: 'equilibrada', weeklyLimitMinutes: 60 },
      tasks: [
        {
          id: 'grande',
          disciplineId: 'bmf',
          remainingMinutes: 240,
          dueAt: null,
          difficulty: null,
          importance: 'alta',
          origin: 'aluno',
        },
      ],
    });
    expect(out.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(60);
    expect(out.unplaced).toEqual([
      expect.objectContaining({ taskId: 'grande', minutes: 180, reason: 'limite_semanal' }),
    ]);
  });

  it('prova antes de qualquer janela: fica de fora com o motivo do prazo', () => {
    const out = planWeek({
      ...base,
      tasks: [
        {
          id: 'cedo',
          disciplineId: 'bmf',
          remainingMinutes: 30,
          dueAt: at(MONDAY, 7),
          difficulty: null,
          importance: null,
          origin: 'prova',
        },
      ],
    });
    expect(out.sessions).toEqual([]);
    expect(out.unplaced[0]).toMatchObject({ reason: 'prazo' });
  });

  it('depois de quatro horas de aula seguidas, a janela da hora seguinte fica livre (6.4)', () => {
    const day = MONDAY;
    const classes = [iv(day, 13, 0, 15, 0), iv(day, 15, 10, 17, 10)];
    expect(afterLongJourneys(classes)).toEqual([iv(day, 17, 10, 18, 10)]);
    const out = planWeek({
      ...base,
      studyWindows: [iv(day, 17, 10, 19, 0)],
      busy: classes,
      classes,
      tasks: [
        {
          id: 'x',
          disciplineId: 'bmf',
          remainingMinutes: 30,
          dueAt: null,
          difficulty: null,
          importance: null,
          origin: 'aluno',
        },
      ],
    });
    expect(out.sessions[0]!.start).toBe(at(day, 18, 10));
    const off = planWeek({
      ...base,
      studyWindows: [iv(day, 17, 10, 19, 0)],
      busy: classes,
      classes,
      prefs: { ...base.prefs, avoidAfterLongJourney: false },
      tasks: [
        {
          id: 'x',
          disciplineId: 'bmf',
          remainingMinutes: 30,
          dueAt: null,
          difficulty: null,
          importance: null,
          origin: 'aluno',
        },
      ],
    });
    expect(off.sessions[0]!.start).toBe(at(day, 17, 10));
  });

  it('intervalos: subtrair e unir', () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
    expect(
      mergeIntervals([
        { start: 5, end: 8 },
        { start: 0, end: 5 },
      ]),
    ).toEqual([{ start: 0, end: 8 }]);
  });
});

describe('"Minha semana está equilibrada?" (EQU-16, 6.4)', () => {
  it('duas avaliações em sete dias ou carga alta: semana intensa; conflito: revisar', () => {
    expect(weekBalance({ assessments: [], busyMinutes: 600, needsReview: false })).toBe(
      'equilibrada',
    );
    expect(
      weekBalance({
        assessments: [at(MONDAY, 8), at(addDays(MONDAY, 4), 8)],
        busyMinutes: 600,
        needsReview: false,
      }),
    ).toBe('intensa');
    expect(
      weekBalance({
        assessments: [at(MONDAY, 8), at(addDays(MONDAY, 8), 8)],
        busyMinutes: 600,
        needsReview: false,
      }),
    ).toBe('equilibrada');
    expect(weekBalance({ assessments: [], busyMinutes: 3000, needsReview: false })).toBe('intensa');
    expect(weekBalance({ assessments: [], busyMinutes: 0, needsReview: true })).toBe('revisar');
  });
});
