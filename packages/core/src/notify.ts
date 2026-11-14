import { localDayKey, zonedTimeToUtc } from './time';

// Avisos (SPEC v2, 5.11). Regras puras: horário silencioso, teto diário e os alertas
// acadêmicos que cada aula e avaliação gera (LEM-15). Cada aviso tem uma chave por origem e
// horário: mudou o horário, muda a chave, e o aviso antigo sai (LEM-13).

const MIN = 60_000;

/** Minuto do dia no fuso do aluno. */
export function localMinute(at: Date, tz: string): number {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
}

/** Dentro do horário silencioso [from, until), que pode atravessar a meia-noite (LEM-12). */
export function inQuietHours(minute: number, from: number | null, until: number | null) {
  if (from === null || until === null || from === until) return false;
  return from < until ? minute >= from && minute < until : minute >= from || minute < until;
}

export type AlertSource =
  | {
      kind: 'lesson';
      id: string;
      title: string;
      discipline: string;
      start: Date;
      allDay: boolean;
      lessonKind: 'aula' | 'pratica' | 'outro';
    }
  | {
      kind: 'assessment';
      id: string;
      name: string;
      discipline: string;
      due: Date;
      allDay: boolean;
      assessmentKind: 'prova' | 'atividade' | 'entrega';
    };

export type DesiredNotification = {
  dedupeKey: string;
  type: 'academic_lesson' | 'academic_assessment';
  title: string;
  body: string | null;
  link: string;
  scheduledFor: Date;
};

const KIND_LABEL = { prova: 'Prova', atividade: 'Atividade', entrega: 'Entrega' } as const;
const LESSON_LABEL = { aula: 'Aula', pratica: 'Prática', outro: 'Evento' } as const;

function hm(d: Date, tz: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

/**
 * Alertas acadêmicos que devem existir a partir de agora: aula e prática 30 min antes;
 * prova, atividade e entrega na véspera às 9h (no fuso do aluno). O que já passou não gera
 * aviso. Feriado e recesso ("outro") não avisam.
 */
export function academicAlerts(
  sources: AlertSource[],
  now: Date,
  tz: string,
  opts: { lessonLeadMinutes?: number } = {},
): DesiredNotification[] {
  const lead = opts.lessonLeadMinutes ?? 30;
  const out: DesiredNotification[] = [];
  for (const s of sources) {
    if (s.kind === 'lesson') {
      if (s.allDay || s.lessonKind === 'outro') continue;
      const at = new Date(s.start.getTime() - lead * MIN);
      if (s.start <= now) continue;
      out.push({
        dedupeKey: `lesson:${s.id}:${s.start.toISOString()}`,
        type: 'academic_lesson',
        title: `${LESSON_LABEL[s.lessonKind]} de ${s.discipline} às ${hm(s.start, tz)}`,
        body: s.title,
        link: '/app/agenda?visao=dia',
        scheduledFor: at < now ? now : at,
      });
    } else {
      if (s.due <= now && !s.allDay) continue;
      const day = localDayKey(s.due, tz);
      if (s.allDay && day < localDayKey(now, tz)) continue;
      const eve = zonedTimeToUtc(previousDay(day), tz, 9);
      const when = s.allDay ? 'amanhã' : `amanhã às ${hm(s.due, tz)}`;
      out.push({
        dedupeKey: `assessment:${s.id}:${s.due.toISOString()}`,
        type: 'academic_assessment',
        title: `${KIND_LABEL[s.assessmentKind]} de ${s.discipline} ${when}`,
        body: s.name,
        link: '/app/agenda?visao=lista',
        scheduledFor: eve < now ? now : eve,
      });
    }
  }
  return out;
}

function previousDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
