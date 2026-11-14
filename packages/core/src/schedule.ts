// Cronograma da disciplina (SPEC v2, DIS-05, DIS-07 e CAL-06). Regras puras: validar o que o
// aluno conferiu, decidir se cada item vira aula ou avaliação e comparar uma nova versão do
// cronograma com o que já está na agenda.

export const SCHEDULE_TYPES = [
  'aula',
  'pratica',
  'prova',
  'atividade',
  'entrega',
  'outro',
] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/** Um item do cronograma em horário local do aluno, como aparece na tela de conferência. */
export type ScheduleItem = {
  date: string; // AAAA-MM-DD
  start: string | null; // HH:MM
  end: string | null; // HH:MM
  type: ScheduleType;
  title: string;
  topic: string | null;
  teacher: string | null;
  location: string | null;
};

export type ScheduleTarget =
  | { table: 'lesson'; kind: 'aula' | 'pratica' | 'outro' }
  | { table: 'assessment'; kind: 'prova' | 'atividade' | 'entrega' };

/** Aula, prática e "outro" (feriado, recesso) vão para a grade; o resto é avaliação. */
export function scheduleTarget(type: ScheduleType): ScheduleTarget {
  if (type === 'aula' || type === 'pratica' || type === 'outro')
    return { table: 'lesson', kind: type };
  return { table: 'assessment', kind: type };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDay(day: string): boolean {
  const m = DATE_RE.exec(day);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseHm(hm: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(hm);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

export type ScheduleItemError =
  'date' | 'start' | 'end' | 'end_before_start' | 'end_without_start' | 'title';

/** Problemas que impedem confirmar o item. Lista vazia: pode confirmar. */
export function scheduleItemErrors(item: ScheduleItem): ScheduleItemError[] {
  const errors: ScheduleItemError[] = [];
  if (!isValidDay(item.date)) errors.push('date');
  if (item.start !== null && !parseHm(item.start)) errors.push('start');
  if (item.end !== null && !parseHm(item.end)) errors.push('end');
  if (item.end !== null && item.start === null) errors.push('end_without_start');
  if (item.start && item.end && parseHm(item.start) && parseHm(item.end) && item.end <= item.start)
    errors.push('end_before_start');
  if (!item.title.trim()) errors.push('title');
  return errors;
}

/** Limpa espaços e troca texto vazio por null, para comparar e gravar sempre igual. */
export function normalizeScheduleItem(item: ScheduleItem): ScheduleItem {
  const clean = (s: string | null) => {
    const t = s?.replace(/\s+/g, ' ').trim() ?? '';
    return t === '' ? null : t;
  };
  return {
    date: item.date.trim(),
    start: clean(item.start),
    end: clean(item.end),
    type: item.type,
    title: clean(item.title) ?? '',
    topic: clean(item.topic),
    teacher: clean(item.teacher),
    location: clean(item.location),
  };
}

const words = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Semelhança de 0 a 1 pelas palavras em comum (Dice), sem acento nem caixa. */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = words(a);
  const y = words(b);
  if (x.length === 0 && y.length === 0) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const set = new Set(y);
  const common = x.filter((w) => set.has(w)).length;
  return (2 * common) / (x.length + y.length);
}

const FIELDS = ['date', 'start', 'end', 'type', 'title', 'topic', 'teacher', 'location'] as const;
export type ScheduleField = (typeof FIELDS)[number];

/** Campos que mudaram entre duas versões do mesmo item. */
export function changedFields(a: ScheduleItem, b: ScheduleItem): ScheduleField[] {
  const x = normalizeScheduleItem(a);
  const y = normalizeScheduleItem(b);
  return FIELDS.filter((f) =>
    f === 'title' || f === 'topic' || f === 'teacher' || f === 'location'
      ? words(x[f]).join(' ') !== words(y[f]).join(' ')
      : x[f] !== y[f],
  );
}

/** Evento já na agenda que veio de um cronograma anterior. */
export type ImportedEvent = {
  id: string;
  table: ScheduleTarget['table'];
  /** Como o aluno confirmou da última vez. */
  original: ScheduleItem;
  /** O aluno mexeu depois de importar (ou a avaliação já tem nota): não sobrescrever. */
  modifiedByStudent: boolean;
};

export type ScheduleDiff = {
  added: ScheduleItem[];
  changed: {
    event: ImportedEvent;
    next: ScheduleItem;
    fields: ScheduleField[];
    keepStudent: boolean;
  }[];
  removed: { event: ImportedEvent; keepStudent: boolean }[];
  unchanged: { event: ImportedEvent; next: ScheduleItem }[];
};

/**
 * Compara a nova versão do cronograma com os eventos importados antes (DIS-07). Casa pela
 * data, pelo tipo e pelo título mais parecido; depois, mesmo tipo e título quase igual em
 * outra data (aula remarcada). O que sobra é incluído ou removido. Evento que o aluno editou
 * vem marcado com `keepStudent`: a mudança aparece, mas a versão dele fica.
 */
export function diffSchedule(existing: ImportedEvent[], incoming: ScheduleItem[]): ScheduleDiff {
  const diff: ScheduleDiff = { added: [], changed: [], removed: [], unchanged: [] };
  const pool = existing.map((e) => ({ e, o: normalizeScheduleItem(e.original) }));
  const items = incoming.map(normalizeScheduleItem);
  const pending: ScheduleItem[] = [];

  const take = (item: ScheduleItem, accept: (o: ScheduleItem) => number | null) => {
    let best = -1;
    let bestScore = -Infinity;
    pool.forEach(({ o }, i) => {
      const score = accept(o);
      if (score !== null && score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best < 0) return null;
    return pool.splice(best, 1)[0]!.e;
  };

  const record = (event: ImportedEvent, next: ScheduleItem) => {
    const fields = changedFields(event.original, next);
    if (fields.length === 0) diff.unchanged.push({ event, next });
    else diff.changed.push({ event, next, fields, keepStudent: event.modifiedByStudent });
  };

  // 1ª passada: mesma data e tipo, título parecido (ou o único do dia).
  for (const item of items) {
    const event = take(item, (o) => {
      if (o.date !== item.date || o.type !== item.type) return null;
      const sim = textSimilarity(o.title, item.title);
      return sim >= 0.5 ? sim + (o.start === item.start ? 0.01 : 0) : null;
    });
    if (event) record(event, item);
    else pending.push(item);
  }
  // 2ª passada: remarcação. Mesmo tipo e título quase igual, data mais próxima.
  for (const item of pending) {
    const event = take(item, (o) => {
      if (o.type !== item.type) return null;
      if (textSimilarity(o.title, item.title) < 0.8) return null;
      return -Math.abs(Date.parse(o.date) - Date.parse(item.date));
    });
    if (event) record(event, item);
    else diff.added.push(item);
  }
  for (const { e } of pool) diff.removed.push({ event: e, keepStudent: e.modifiedByStudent });
  return diff;
}
