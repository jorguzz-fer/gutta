import {
  addDays,
  occurrenceDates,
  type DayKey,
  type OccurrenceChange,
  type Series,
} from './recurrence';
import { localDayKey, zonedTimeToUtc } from './time';

// Agenda única (SPEC v2, 7.6). Cada fato tem uma tabela dona; aqui tudo vira ocorrência no
// mesmo formato, no fuso do aluno. Calendário da disciplina, agenda geral, visão do dia,
// Equilíbrio e lembretes leem desta projeção, e nada é copiado (CAL-16).

export type AgendaSource = 'lesson' | 'assessment' | 'routine' | 'event' | 'session' | 'reminder';

/** Tipo exibido (CAL-03). A cor vem do tipo ou da disciplina. */
export type AgendaKind =
  | 'aula'
  | 'pratica'
  | 'prova'
  | 'atividade'
  | 'entrega'
  | 'estudo'
  | 'revisao'
  | 'pessoal'
  | 'compromisso'
  | 'outro';

const ACADEMIC: ReadonlySet<AgendaKind> = new Set([
  'aula',
  'pratica',
  'prova',
  'atividade',
  'entrega',
  'estudo',
  'revisao',
]);

/** Compromisso acadêmico e pessoal são visualmente distintos (CAL-15). */
export const isAcademic = (kind: AgendaKind) => ACADEMIC.has(kind);

type Base = {
  source: AgendaSource;
  sourceId: string;
  kind: AgendaKind;
  title: string;
  disciplineId?: string | null;
  /** Categoria da rotina (sono, academia...) ou etiqueta do aluno. */
  category?: string | null;
  color?: number | null;
  /**
   * Horário que o planejamento nunca usa: aula (ROT-05) e pessoal protegido (ROT-06).
   */
  protected: boolean;
  /** Só bloco de estudo da rotina é horário autorizado para o Equilíbrio (ROT-08). */
  studyWindow?: boolean;
  /** Ocupa o horário (lembrete sem reserva não ocupa). */
  blocksTime: boolean;
};

/** Fato datado, já em UTC: aula, avaliação, sessão de estudo. */
export type SingleItem = Base & {
  start: Date;
  /** Sem fim: evento pontual (prova às 19:00). */
  end: Date | null;
  allDay: boolean;
};

/** Fato que se repete: bloco da rotina, compromisso recorrente. Horários locais. */
export type SeriesItem = Base &
  Series<OccurrenceChange> & {
    /** HH:MM local; null = dia inteiro. */
    startTime: string | null;
    durationMinutes: number;
  };

export type Occurrence = Base & {
  /** Estável: fonte, id e data original da ocorrência (a exceção aponta para ela). */
  id: string;
  /** Dia local em que a ocorrência acontece. */
  date: DayKey;
  /** Dia original na série (difere de `date` quando a ocorrência foi remarcada). */
  originalDate: DayKey;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Ocorrência alterada só nela ("só esta"). */
  modified: boolean;
};

const MIN = 60_000;

function parseTime(hm: string): [number, number] {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) throw new Error(`Hora inválida: ${hm}`);
  return [Number(m[1]), Number(m[2])];
}

/** Início e fim UTC de um dia local inteiro (o fim é a meia-noite seguinte). */
export function localDayBounds(day: DayKey, tz: string): { from: Date; to: Date } {
  return { from: zonedTimeToUtc(day, tz), to: zonedTimeToUtc(addDays(day, 1), tz) };
}

/** Semana de domingo a sábado que contém o dia, em UTC (ROT-01). */
export function weekBounds(day: DayKey, tz: string): { from: Date; to: Date; days: DayKey[] } {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  const first = addDays(day, -wd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return { from: zonedTimeToUtc(first, tz), to: zonedTimeToUtc(addDays(first, 7), tz), days };
}

const overlaps = (start: Date, end: Date, from: Date, to: Date) =>
  start.getTime() === end.getTime() ? start >= from && start < to : start < to && end > from;

function occurrence(
  item: Base,
  originalDate: DayKey,
  date: DayKey,
  startTime: string | null,
  durationMinutes: number,
  tz: string,
  extra: { title?: string; modified: boolean },
): Occurrence {
  let start: Date;
  let end: Date;
  if (startTime === null) {
    ({ from: start, to: end } = localDayBounds(date, tz));
  } else {
    const [h, m] = parseTime(startTime);
    start = zonedTimeToUtc(date, tz, h, m);
    end = new Date(start.getTime() + Math.max(0, durationMinutes) * MIN);
  }
  return {
    ...pickBase(item),
    title: extra.title ?? item.title,
    id: `${item.source}:${item.sourceId}:${originalDate}`,
    date,
    originalDate,
    start,
    end,
    allDay: startTime === null,
    modified: extra.modified,
  };
}

function pickBase(item: Base): Base {
  return {
    source: item.source,
    sourceId: item.sourceId,
    kind: item.kind,
    title: item.title,
    disciplineId: item.disciplineId ?? null,
    category: item.category ?? null,
    color: item.color ?? null,
    protected: item.protected,
    studyWindow: item.studyWindow ?? false,
    blocksTime: item.blocksTime,
  };
}

/**
 * Projeta tudo em ocorrências que tocam [from, to), ordenadas pelo início. Série respeita o
 * horário local mesmo com mudança de fuso (horário de verão); bloco que passa da meia-noite
 * (sono das 23:00 às 07:00) aparece também no dia seguinte da janela.
 */
export function projectAgenda(input: {
  tz: string;
  from: Date;
  to: Date;
  singles?: SingleItem[];
  series?: SeriesItem[];
}): Occurrence[] {
  const { tz, from, to } = input;
  if (to <= from) return [];
  const out: Occurrence[] = [];

  for (const s of input.singles ?? []) {
    let start = s.start;
    let end = s.end ?? s.start;
    let date = localDayKey(start, tz);
    if (s.allDay) {
      ({ from: start, to: end } = localDayBounds(date, tz));
      if (s.end && s.end > end) end = s.end;
    }
    if (!overlaps(start, end, from, to)) continue;
    date = localDayKey(start, tz);
    out.push({
      ...pickBase(s),
      id: `${s.source}:${s.sourceId}`,
      date,
      originalDate: date,
      start,
      end,
      allDay: s.allDay,
      modified: false,
    });
  }

  // Um dia antes da janela: pega o que começou na véspera e ainda não acabou.
  const firstDay = addDays(localDayKey(from, tz), -1);
  const lastDay = localDayKey(new Date(to.getTime() - 1), tz);
  for (const s of input.series ?? []) {
    const exceptions = new Map((s.exceptions ?? []).map((e) => [e.date, e]));
    for (const d of occurrenceDates(s.startDate, s.rule, firstDay, lastDay)) {
      const ex = exceptions.get(d);
      if (ex?.cancelled || ex?.change) continue;
      const occ = occurrence(s, d, d, s.startTime, s.durationMinutes, tz, { modified: false });
      if (overlaps(occ.start, occ.end, from, to)) out.push(occ);
    }
    // Ocorrências alteradas: podem ter mudado de dia, para dentro ou para fora da janela.
    for (const ex of exceptions.values()) {
      if (ex.cancelled || !ex.change) continue;
      if (occurrenceDates(s.startDate, s.rule, ex.date, ex.date).length === 0) continue;
      const c = ex.change;
      const occ = occurrence(
        s,
        ex.date,
        c.date ?? ex.date,
        c.start !== undefined ? c.start : s.startTime,
        c.durationMinutes ?? s.durationMinutes,
        tz,
        { title: c.title, modified: true },
      );
      if (overlaps(occ.start, occ.end, from, to)) out.push(occ);
    }
  }

  return out.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      Number(b.allDay) - Number(a.allDay) ||
      a.title.localeCompare(b.title, 'pt-BR'),
  );
}

/** Minutos da ocorrência dentro de [from, to). */
export function minutesWithin(o: Pick<Occurrence, 'start' | 'end'>, from: Date, to: Date): number {
  const s = Math.max(o.start.getTime(), from.getTime());
  const e = Math.min(o.end.getTime(), to.getTime());
  return Math.max(0, Math.round((e - s) / MIN));
}

/** Soma de minutos por chave (ROT-10 e ROT-12), sem contar dia inteiro. */
export function minutesBy<K extends string>(
  occurrences: Occurrence[],
  from: Date,
  to: Date,
  key: (o: Occurrence) => K | null,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const o of occurrences) {
    if (o.allDay) continue;
    const k = key(o);
    if (k === null) continue;
    out[k] = (out[k] ?? 0) + minutesWithin(o, from, to);
  }
  return out;
}

/** Pares de ocorrências que ocupam o mesmo horário (os dois ocupam tempo e têm hora). */
export function overlapping(occurrences: Occurrence[]): [Occurrence, Occurrence][] {
  const timed = occurrences
    .filter((o) => o.blocksTime && !o.allDay && o.end > o.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const pairs: [Occurrence, Occurrence][] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j]!.start < timed[i]!.end; j++) {
      pairs.push([timed[i]!, timed[j]!]);
    }
  }
  return pairs;
}
