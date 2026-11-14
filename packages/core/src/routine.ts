import { minutesBy, type AgendaKind, type Occurrence, type SeriesItem } from './agenda';
import type { DayKey } from './recurrence';

// Rotina semanal (SPEC v2, 5.3). Regras puras: categorias, conversão do bloco em série da
// agenda, conflito entre blocos, resumo da semana e a frase da meta (tom de voz, 6.2).

export const ROUTINE_KINDS = ['aula', 'estudo', 'pessoal'] as const;
export type RoutineKind = (typeof ROUTINE_KINDS)[number];

/** Atividades pessoais (ROT-03, ROT-06, ROT-07). Todas protegidas do planejamento. */
export const PERSONAL_CATEGORIES = [
  { key: 'sono', label: 'Sono' },
  { key: 'refeicao', label: 'Refeição' },
  { key: 'lazer', label: 'Lazer' },
  { key: 'academia', label: 'Academia' },
  { key: 'esporte', label: 'Esporte' },
  { key: 'idiomas', label: 'Idiomas' },
  { key: 'trabalho', label: 'Trabalho' },
  { key: 'descanso', label: 'Descanso' },
  { key: 'bloqueado', label: 'Horário bloqueado' },
  { key: 'personalizada', label: 'Outra atividade' },
] as const;
export type PersonalCategory = (typeof PERSONAL_CATEGORIES)[number]['key'];

export type RoutineBlock = {
  id: string;
  kind: RoutineKind;
  category: string | null;
  label: string;
  disciplineId: string | null;
  color: number | null;
  weekdays: number[];
  startMinute: number;
  durationMinutes: number;
  validFrom: DayKey;
  validUntil: DayKey | null;
};

export const WEEK = 7 * 1440;

export function minuteToHm(m: number): string {
  const v = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function hmToMinute(hm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Duração de um intervalo início–fim no relógio. Fim igual ou antes do início passa da
 * meia-noite (sono das 23:00 às 07:00 = 8 h); "00:00" de fim é a meia-noite seguinte.
 */
export function durationBetween(startMinute: number, endMinute: number): number {
  const d = endMinute - startMinute;
  return d > 0 ? d : d + 1440;
}

const KIND_OF: Record<RoutineKind, AgendaKind> = {
  aula: 'aula',
  estudo: 'estudo',
  pessoal: 'pessoal',
};

/** Bloco como série da agenda: repete nos dias escolhidos enquanto vale. */
export function routineSeries(b: RoutineBlock): SeriesItem {
  return {
    source: 'routine',
    sourceId: b.id,
    kind: KIND_OF[b.kind],
    title: b.label,
    disciplineId: b.disciplineId,
    category: b.kind === 'pessoal' ? b.category : null,
    color: b.color,
    // Aula e pessoal nunca entram no planejamento (ROT-05, ROT-06); estudo é a janela (ROT-08).
    protected: b.kind !== 'estudo',
    studyWindow: b.kind === 'estudo',
    blocksTime: true,
    startDate: b.validFrom,
    rule: { freq: 'weekly', weekdays: b.weekdays, until: b.validUntil },
    startTime: minuteToHm(b.startMinute),
    durationMinutes: b.durationMinutes,
  };
}

/** Intervalos do bloco numa semana circular (minutos desde domingo 00:00). */
function weekIntervals(b: Pick<RoutineBlock, 'weekdays' | 'startMinute' | 'durationMinutes'>) {
  const out: [number, number][] = [];
  for (const d of b.weekdays) {
    const s = d * 1440 + b.startMinute;
    const e = s + b.durationMinutes;
    if (e <= WEEK) out.push([s, e]);
    else out.push([s, WEEK], [0, e - WEEK]); // sábado à noite entra no domingo
  }
  return out;
}

/** Blocos que ocupam o mesmo horário que `candidate` em algum dia (a rotina não sobrepõe). */
export function routineConflicts<
  B extends Pick<RoutineBlock, 'id' | 'weekdays' | 'startMinute' | 'durationMinutes'>,
>(
  candidate: Pick<RoutineBlock, 'weekdays' | 'startMinute' | 'durationMinutes'> & { id?: string },
  blocks: B[],
): B[] {
  const mine = weekIntervals(candidate);
  return blocks.filter(
    (b) =>
      b.id !== candidate.id &&
      weekIntervals(b).some(([s, e]) => mine.some(([s2, e2]) => s < e2 && s2 < e)),
  );
}

export type RoutineSummary = {
  /** Aulas do cronograma na semana mais aulas montadas na grade. */
  classMinutes: number;
  studyMinutes: number;
  otherMinutes: number;
  totalMinutes: number;
};

/** Resumo da rotina (ROT-12). Sono não conta como "outras atividades". */
export function routineSummary(occurrences: Occurrence[], from: Date, to: Date): RoutineSummary {
  const by = minutesBy(occurrences, from, to, (o) => {
    if (o.kind === 'aula' || o.kind === 'pratica') return 'class';
    if (o.source === 'routine' && o.kind === 'estudo') return 'study';
    if (o.source === 'routine' && o.kind === 'pessoal' && o.category !== 'sono') return 'other';
    return null;
  });
  const classMinutes = by.class ?? 0;
  const studyMinutes = by.study ?? 0;
  const otherMinutes = by.other ?? 0;
  return {
    classMinutes,
    studyMinutes,
    otherMinutes,
    totalMinutes: classMinutes + studyMinutes + otherMinutes,
  };
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export type GoalStatus = {
  goalMinutes: number;
  plannedMinutes: number;
  /** 0 a 100, para a barra (ROT-10). */
  percent: number;
  missingMinutes: number;
  extraMinutes: number;
  /** Frase no tom de voz da SPEC (6.2): informa e oferece, nunca cobra. */
  message: string;
};

/** Meta semanal de estudo extraclasse (ROT-09, ROT-10, ROT-13). */
export function goalStatus(goalMinutes: number, plannedMinutes: number): GoalStatus {
  const missing = Math.max(0, goalMinutes - plannedMinutes);
  const extra = Math.max(0, plannedMinutes - goalMinutes);
  const percent =
    goalMinutes <= 0 ? 100 : Math.min(100, Math.round((plannedMinutes / goalMinutes) * 100));
  const planned = formatHours(plannedMinutes);
  const goal = formatHours(goalMinutes);
  let message: string;
  if (goalMinutes <= 0) message = `Sua rotina soma ${planned} de estudo.`;
  else if (plannedMinutes === 0)
    message = `Marque na grade os horários em que você quer estudar. A sugestão é de ${goal} por semana.`;
  else if (missing > 0)
    message = `Sua rotina soma ${planned} de estudo. Faltam ${formatHours(missing)} para a sugestão de ${goal}.`;
  else if (extra > 0)
    message = `Sua rotina soma ${planned} de estudo, acima da sugestão de ${goal}. Se a semana pesar, dá para reduzir.`;
  else message = `Sua rotina soma ${planned} de estudo, a sugestão da semana.`;
  return {
    goalMinutes,
    plannedMinutes,
    percent,
    missingMinutes: missing,
    extraMinutes: extra,
    message,
  };
}
