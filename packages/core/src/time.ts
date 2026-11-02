// Datas no fuso do aluno. Persistimos em UTC; "hoje" e "amanhã" dependem do fuso (SPEC §13.3).

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(date))
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Diferença (ms) entre o relógio local do fuso e UTC naquele instante. */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "AAAA-MM-DD" do dia local do aluno. */
export function localDayKey(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instante UTC que corresponde a `hh:mm` local do dia `AAAA-MM-DD` no fuso. */
export function zonedTimeToUtc(day: string, tz: string, hour = 0, minute = 0): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Data inválida: ${day}`);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, minute);
  // Duas passadas resolvem a virada de horário de verão.
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  ts = guess - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** Início do dia local seguinte, em UTC. Revisão "vence hoje" = due_at < fim do dia local. */
export function endOfLocalDay(date: Date, tz: string): Date {
  const key = localDayKey(date, tz);
  const next = new Date(zonedTimeToUtc(key, tz).getTime() + 36 * 3600_000);
  return zonedTimeToUtc(localDayKey(next, tz), tz);
}

/** Dias inteiros de calendário local entre dois instantes (b - a). */
export function localDaysBetween(a: Date, b: Date, tz: string): number {
  const da = zonedTimeToUtc(localDayKey(a, tz), tz, 12);
  const db = zonedTimeToUtc(localDayKey(b, tz), tz, 12);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Dia da semana local (0 = domingo). */
export function localWeekday(date: Date, tz: string): number {
  const key = localDayKey(date, tz);
  const [y, mo, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
