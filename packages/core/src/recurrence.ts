// Recorrência (SPEC v2, 7.6 e CAL-04; ROT-04). Regra simples, em dias locais do aluno, com
// exceções por ocorrência. Datas são "AAAA-MM-DD" e horas "HH:MM", sempre no fuso do aluno;
// a conversão para UTC fica na agenda (agenda.ts), na hora de projetar.

export type DayKey = string; // AAAA-MM-DD

export type RecurrenceRule =
  | { freq: 'daily'; interval?: number; until?: DayKey | null; count?: number | null }
  | {
      freq: 'weekly';
      /** Dias da semana, 0 = domingo. Vazio: o dia da semana da primeira ocorrência. */
      weekdays: number[];
      interval?: number;
      until?: DayKey | null;
      count?: number | null;
    }
  | { freq: 'monthly'; interval?: number; until?: DayKey | null; count?: number | null }
  | { freq: 'dates'; dates: DayKey[] };

/** Mudança de uma ocorrência ("só esta"). `date` é a data original da ocorrência. */
export type OccurrenceException<C = OccurrenceChange> = {
  date: DayKey;
  cancelled?: boolean;
  change?: C;
};

export type OccurrenceChange = {
  date?: DayKey;
  start?: string | null;
  durationMinutes?: number;
  title?: string;
};

/** Série: primeira ocorrência, regra (null = evento único) e exceções. */
export type Series<C = OccurrenceChange> = {
  startDate: DayKey;
  rule: RecurrenceRule | null;
  exceptions?: OccurrenceException<C>[];
};

const DAY = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dayToUtc(day: DayKey): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Data inválida: ${day}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function utcToDay(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: DayKey, n: number): DayKey {
  return utcToDay(dayToUtc(day) + n * DAY);
}

export function weekdayOf(day: DayKey): number {
  return new Date(dayToUtc(day)).getUTCDay();
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((dayToUtc(b) - dayToUtc(a)) / DAY);
}

/** Domingo da semana que contém o dia (a grade da rotina começa no domingo, ROT-01). */
export function weekStart(day: DayKey): DayKey {
  return addDays(day, -weekdayOf(day));
}

/** Limite de segurança: regra sem fim não gera lista infinita. */
const MAX_OCCURRENCES = 5000;

/**
 * Datas das ocorrências entre `from` e `to` (inclusive), respeitando `until` e `count`
 * (contados desde a primeira ocorrência, não desde `from`). Não aplica exceções.
 */
export function occurrenceDates(
  startDate: DayKey,
  rule: RecurrenceRule | null,
  from: DayKey,
  to: DayKey,
): DayKey[] {
  if (to < from) return [];
  if (!rule) return startDate >= from && startDate <= to ? [startDate] : [];
  if (rule.freq === 'dates') {
    return [...new Set(rule.dates)].filter((d) => d >= from && d <= to).sort();
  }
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  const until = rule.until ?? null;
  const count = rule.count ?? null;
  const last = until && until < to ? until : to;
  const out: DayKey[] = [];
  let n = 0;
  const emit = (d: DayKey) => {
    n++;
    if (d >= from && d <= last) out.push(d);
  };
  const done = (d: DayKey) =>
    d > last || (count !== null && n >= count) || out.length >= MAX_OCCURRENCES;

  if (rule.freq === 'daily') {
    // Pula direto para perto de `from` quando não há contagem a respeitar.
    let d = startDate;
    if (count === null && from > startDate) {
      const steps = Math.floor(daysBetween(startDate, from) / interval);
      d = addDays(startDate, steps * interval);
    }
    for (; !done(d); d = addDays(d, interval)) emit(d);
    return out;
  }

  if (rule.freq === 'weekly') {
    const days = (rule.weekdays.length ? [...new Set(rule.weekdays)] : [weekdayOf(startDate)])
      .filter((w) => w >= 0 && w <= 6)
      .sort();
    let week = weekStart(startDate);
    if (count === null && from > startDate) {
      const weeks = Math.floor(daysBetween(week, weekStart(from)) / 7 / interval);
      week = addDays(week, weeks * interval * 7);
    }
    for (;;) {
      for (const w of days) {
        const d = addDays(week, w);
        if (d < startDate) continue;
        if (done(d)) return out;
        emit(d);
      }
      week = addDays(week, interval * 7);
      if (week > last) return out;
    }
  }

  // Mensal: mesmo dia do mês; mês sem esse dia (31 em abril) fica sem ocorrência.
  const [y, m, dd] = startDate.split('-').map(Number) as [number, number, number];
  for (let k = 0; ; k += interval) {
    const date = new Date(Date.UTC(y, m - 1 + k, dd));
    if (date.getUTCDate() !== dd) {
      if (utcToDay(date.getTime()) > last) return out;
      continue;
    }
    const d = utcToDay(date.getTime());
    if (done(d)) return out;
    emit(d);
  }
}

export function isOccurrence(series: Series<unknown>, day: DayKey): boolean {
  return occurrenceDates(series.startDate, series.rule, day, day).length === 1;
}

/** "Só esta": grava ou troca a exceção daquela ocorrência. */
export function editOccurrence<C>(series: Series<C>, date: DayKey, change: C): Series<C> {
  if (!isOccurrence(series, date)) throw new Error(`Não há ocorrência em ${date}.`);
  const rest = (series.exceptions ?? []).filter((e) => e.date !== date);
  return { ...series, exceptions: [...rest, { date, change }] };
}

/** "Só esta" para excluir. */
export function cancelOccurrence<C>(series: Series<C>, date: DayKey): Series<C> {
  if (!isOccurrence(series, date)) throw new Error(`Não há ocorrência em ${date}.`);
  const rest = (series.exceptions ?? []).filter((e) => e.date !== date);
  return { ...series, exceptions: [...rest, { date, cancelled: true }] };
}

/** Quantas ocorrências a série tem antes de `date` (para dividir a contagem). */
function countBefore(series: Series<unknown>, date: DayKey): number {
  if (date <= series.startDate) return 0;
  return occurrenceDates(series.startDate, series.rule, series.startDate, addDays(date, -1)).length;
}

/**
 * "Esta e as próximas": a série original termina na véspera e uma nova começa em `date`,
 * com a mesma regra (o chamador aplica a mudança na nova). Exceções vão para o lado delas.
 * Se `date` for a primeira ocorrência, `before` é null (a mudança vale para a série toda).
 */
export function splitSeries<C>(
  series: Series<C>,
  date: DayKey,
): { before: Series<C> | null; after: Series<C> } {
  if (!isOccurrence(series, date)) throw new Error(`Não há ocorrência em ${date}.`);
  const exceptions = series.exceptions ?? [];
  if (!series.rule || date === series.startDate) return { before: null, after: series };
  const rule = series.rule;
  const used = countBefore(series, date);
  const before: Series<C> = {
    startDate: series.startDate,
    rule:
      rule.freq === 'dates'
        ? { freq: 'dates', dates: rule.dates.filter((d) => d < date) }
        : { ...rule, until: addDays(date, -1), count: null },
    exceptions: exceptions.filter((e) => e.date < date),
  };
  const after: Series<C> = {
    startDate: date,
    rule:
      rule.freq === 'dates'
        ? { freq: 'dates', dates: rule.dates.filter((d) => d >= date) }
        : rule.freq === 'weekly'
          ? {
              ...rule,
              // Semana a semana com intervalo: a nova série precisa cair nas mesmas semanas.
              weekdays: rule.weekdays.length ? rule.weekdays : [weekdayOf(series.startDate)],
              count: rule.count != null ? rule.count - used : null,
            }
          : { ...rule, count: rule.count != null ? rule.count - used : null },
    exceptions: exceptions.filter((e) => e.date >= date),
  };
  return { before, after };
}

/** Exclui "esta e as próximas": a série acaba na véspera (null se não sobrar nada). */
export function endSeriesBefore<C>(series: Series<C>, date: DayKey): Series<C> | null {
  const { before } = splitSeries(series, date);
  return before;
}
