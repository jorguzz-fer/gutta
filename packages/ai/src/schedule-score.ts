import type { ScheduleEvent } from './schedule';

// Pontuação do experimento de extração (plano, item 36): compara o que a IA leu com o
// gabarito escrito à mão para cada cronograma real.

export type ExpectedEvent = Pick<ScheduleEvent, 'date' | 'type' | 'title'> &
  Partial<Pick<ScheduleEvent, 'start' | 'end' | 'topic' | 'teacher' | 'location'>>;

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Semelhança de 0 a 1 pelas palavras em comum (Dice). */
export function similarity(a: string | null | undefined, b: string | null | undefined) {
  const x = norm(a);
  const y = norm(b);
  if (x.length === 0 && y.length === 0) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const set = new Set(y);
  const common = x.filter((w) => set.has(w)).length;
  return (2 * common) / (x.length + y.length);
}

export type FieldScore = { right: number; total: number };
export type DocScore = {
  expected: number;
  extracted: number;
  matched: number;
  recall: number;
  precision: number;
  fields: Record<'start' | 'end' | 'title' | 'topic' | 'teacher' | 'location', FieldScore>;
  missing: ExpectedEvent[];
  extra: ScheduleEvent[];
};

/**
 * Casa os itens pela data e pelo tipo; no mesmo dia e tipo, pelo título mais parecido.
 * Campo só conta quando o gabarito tem valor para ele (null no gabarito também conta: a IA
 * precisa devolver null, sem inventar).
 */
export function scoreSchedule(expected: ExpectedEvent[], got: ScheduleEvent[]): DocScore {
  const pool = [...got];
  const fields: DocScore['fields'] = {
    start: { right: 0, total: 0 },
    end: { right: 0, total: 0 },
    title: { right: 0, total: 0 },
    topic: { right: 0, total: 0 },
    teacher: { right: 0, total: 0 },
    location: { right: 0, total: 0 },
  };
  const missing: ExpectedEvent[] = [];
  let matched = 0;
  for (const e of expected) {
    let best = -1;
    let bestSim = -1;
    pool.forEach((g, i) => {
      if (g.date !== e.date || g.type !== e.type) return;
      const sim = similarity(e.title, g.title);
      if (sim > bestSim) {
        best = i;
        bestSim = sim;
      }
    });
    if (best < 0) {
      missing.push(e);
      continue;
    }
    const g = pool.splice(best, 1)[0]!;
    matched++;
    fields.title.total++;
    if (bestSim >= 0.6) fields.title.right++;
    for (const k of ['start', 'end'] as const) {
      if (e[k] === undefined) continue;
      fields[k].total++;
      if ((e[k] ?? null) === (g[k] ?? null)) fields[k].right++;
    }
    for (const k of ['topic', 'teacher', 'location'] as const) {
      if (e[k] === undefined) continue;
      fields[k].total++;
      const ok = e[k] === null ? g[k] === null : similarity(e[k], g[k]) >= 0.6;
      if (ok) fields[k].right++;
    }
  }
  return {
    expected: expected.length,
    extracted: got.length,
    matched,
    recall: expected.length ? matched / expected.length : 1,
    precision: got.length ? matched / got.length : 1,
    fields,
    missing,
    extra: pool,
  };
}
