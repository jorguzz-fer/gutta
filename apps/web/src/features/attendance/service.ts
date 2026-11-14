import 'server-only';
import { addDays, attendanceSummary, localDayKey, weekdayOf, zonedTimeToUtc } from '@gutta/core';
import type { attendance as contract } from '@gutta/contracts';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  schema as s,
  withUser,
  type Tx,
} from '@gutta/db';
import type { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';
import { removeNotification, upsertNotification } from '@/features/notifications/service';

// Faltas (SPEC v2, FAL-01 a FAL-05, FAL-07, FAL-09, FAL-10, FAL-12, FAL-13). Controle pessoal
// em horas-aula. Os dias de aula vêm do cronograma; sem ele, dos dias configurados.

type RuleBody = z.output<typeof contract.ruleBody>;
type Dto = contract.AttendanceDto;

export async function assertAttendanceEnabled() {
  const on = await flags();
  if (!on.faltas) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function tzOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

async function findDiscipline(tx: Tx, userId: string, id: string) {
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(eq(s.enrolledDisciplines.id, id), eq(s.enrolledDisciplines.ownerId, userId)),
  });
  if (!d) throw notFound('Disciplina');
  return d;
}

const num = (v: string | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

async function load(tx: Tx, userId: string, disciplineId: string, month?: string): Promise<Dto> {
  const disc = await findDiscipline(tx, userId, disciplineId);
  const tz = await tzOf(tx, userId);
  const rule = await tx.query.attendanceRules.findFirst({
    where: eq(s.attendanceRules.disciplineId, disciplineId),
  });
  const absences = await tx
    .select({ a: s.absences, title: s.lessons.title })
    .from(s.absences)
    .leftJoin(s.lessons, eq(s.lessons.id, s.absences.lessonId))
    .where(eq(s.absences.disciplineId, disciplineId))
    .orderBy(desc(s.absences.date));

  const m = month ?? localDayKey(new Date(), tz).slice(0, 7);
  const first = `${m}-01`;
  const next = addDays(`${m}-28`, 7).slice(0, 7) + '-01';
  const perMeeting = rule ? num(rule.classHoursPerMeeting) : 2;
  const lessons = await tx
    .select()
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.disciplineId, disciplineId),
        isNull(s.lessons.cancelledAt),
        inArray(s.lessons.kind, ['aula', 'pratica']),
        gte(s.lessons.startsAt, zonedTimeToUtc(first, tz)),
        lt(s.lessons.startsAt, zonedTimeToUtc(next, tz)),
      ),
    )
    .orderBy(asc(s.lessons.startsAt));
  const byLesson = new Map(absences.filter((x) => x.a.lessonId).map((x) => [x.a.lessonId!, x.a]));
  const byDay = new Map(absences.filter((x) => !x.a.lessonId).map((x) => [x.a.date, x.a]));
  let classDays: contract.AttendanceDto['classDays'];
  if (lessons.length) {
    // Horas-aula reais de cada encontro, quando o cronograma diz (FAL-10).
    classDays = lessons.map((l) => ({
      date: localDayKey(l.startsAt, tz),
      lessonId: l.id,
      title: l.title,
      classHours: l.classHours ? num(l.classHours) : perMeeting,
      absenceId: byLesson.get(l.id)?.id ?? null,
    }));
  } else {
    const days: string[] = [];
    for (let d = first; d < next; d = addDays(d, 1))
      if (rule?.weekdays?.includes(weekdayOf(d))) days.push(d);
    classDays = days.map((d) => ({
      date: d,
      lessonId: null,
      title: null,
      classHours: perMeeting,
      absenceId: byDay.get(d)?.id ?? null,
    }));
  }

  const summary = rule
    ? attendanceSummary({
        totalClassHours: num(rule.totalClassHours),
        minAttendancePct: num(rule.minAttendancePct),
        absences: absences.map((x) => num(x.a.classHours)),
        thresholds: rule.alertThresholds,
      })
    : null;
  return {
    disciplineId,
    disciplineName: disc.name,
    rule: rule
      ? {
          totalClassHours: num(rule.totalClassHours),
          minAttendancePct: num(rule.minAttendancePct),
          classHoursPerMeeting: num(rule.classHoursPerMeeting),
          weekdays: rule.weekdays,
          alertThresholds: rule.alertThresholds,
        }
      : null,
    summary,
    month: m,
    classDays,
    absences: absences.map((x) => ({
      id: x.a.id,
      lessonId: x.a.lessonId,
      date: x.a.date,
      lessonTitle: x.title ?? null,
      classHours: num(x.a.classHours),
      note: x.a.note,
    })),
  };
}

/** Avisos de limiar (FAL-07): um por limiar alcançado; voltou abaixo, o aviso sai. */
async function syncThresholds(tx: Tx, userId: string, dto: Dto) {
  if (!dto.rule || !dto.summary) return;
  const prefix = `attendance:${dto.disciplineId}:`;
  for (const t of dto.rule.alertThresholds) {
    const key = `${prefix}${t}`;
    if (dto.summary.reachedThresholds.includes(t)) {
      const existing = await tx.query.notifications.findFirst({
        where: and(eq(s.notifications.ownerId, userId), eq(s.notifications.dedupeKey, key)),
      });
      if (existing) continue;
      await upsertNotification(tx, userId, {
        dedupeKey: key,
        type: 'attendance',
        title: `Faltas em ${dto.disciplineName}: ${t}% do limite`,
        body: `${dto.summary.registered} de ${dto.summary.limit} horas-aula de falta permitidas no seu controle.`,
        link: `/app/faltas/${dto.disciplineId}`,
        scheduledFor: new Date(),
      });
    } else {
      await removeNotification(tx, userId, key);
    }
  }
  // Limiares que saíram da configuração.
  const stale = await tx
    .select({ key: s.notifications.dedupeKey })
    .from(s.notifications)
    .where(and(eq(s.notifications.ownerId, userId), like(s.notifications.dedupeKey, `${prefix}%`)));
  for (const { key } of stale)
    if (!dto.rule.alertThresholds.includes(Number(key.slice(prefix.length))))
      await removeNotification(tx, userId, key);
}

export async function getAttendance(userId: string, disciplineId: string, month?: string) {
  await assertAttendanceEnabled();
  return withUser(db(), userId, async (tx) => ({
    attendance: await load(tx, userId, disciplineId, month),
  }));
}

export async function saveRule(userId: string, disciplineId: string, body: RuleBody) {
  await assertAttendanceEnabled();
  return withUser(db(), userId, async (tx) => {
    await findDiscipline(tx, userId, disciplineId);
    const values = {
      totalClassHours: String(body.totalClassHours),
      minAttendancePct: String(body.minAttendancePct),
      classHoursPerMeeting: String(body.classHoursPerMeeting),
      weekdays: body.weekdays ? [...new Set(body.weekdays)].sort() : null,
      alertThresholds: [...new Set(body.alertThresholds)].sort((a, b) => a - b),
    };
    await tx
      .insert(s.attendanceRules)
      .values({ ownerId: userId, disciplineId, ...values })
      .onConflictDoUpdate({ target: s.attendanceRules.disciplineId, set: values });
    const dto = await load(tx, userId, disciplineId);
    await syncThresholds(tx, userId, dto);
    return { attendance: dto };
  });
}

export async function recordAbsence(
  userId: string,
  disciplineId: string,
  body: { date: string; lessonId: string | null; classHours: number; note: string | null },
) {
  await assertAttendanceEnabled();
  return withUser(db(), userId, async (tx) => {
    await findDiscipline(tx, userId, disciplineId);
    if (body.lessonId) {
      const l = await tx.query.lessons.findFirst({
        where: and(eq(s.lessons.id, body.lessonId), eq(s.lessons.disciplineId, disciplineId)),
      });
      if (!l) throw notFound('Aula');
    }
    const values = { classHours: String(body.classHours), note: body.note, date: body.date };
    // Registrar de novo a mesma aula atualiza (FAL-09).
    const existing = await tx.query.absences.findFirst({
      where: and(
        eq(s.absences.disciplineId, disciplineId),
        body.lessonId
          ? eq(s.absences.lessonId, body.lessonId)
          : and(isNull(s.absences.lessonId), eq(s.absences.date, body.date)),
      ),
    });
    if (existing) await tx.update(s.absences).set(values).where(eq(s.absences.id, existing.id));
    else
      await tx
        .insert(s.absences)
        .values({ ownerId: userId, disciplineId, lessonId: body.lessonId, ...values });
    const dto = await load(tx, userId, disciplineId, body.date.slice(0, 7));
    await syncThresholds(tx, userId, dto);
    return { attendance: dto };
  });
}

export async function removeAbsence(userId: string, disciplineId: string, absenceId: string) {
  await assertAttendanceEnabled();
  return withUser(db(), userId, async (tx) => {
    const [row] = await tx
      .delete(s.absences)
      .where(and(eq(s.absences.id, absenceId), eq(s.absences.disciplineId, disciplineId)))
      .returning();
    if (!row) throw notFound('Falta');
    const dto = await load(tx, userId, disciplineId, row.date.slice(0, 7));
    await syncThresholds(tx, userId, dto);
    return { attendance: dto };
  });
}

/** Resumo por disciplina, para a lista de faltas e o Meu Espaço. */
export async function attendanceOverview(userId: string) {
  await assertAttendanceEnabled();
  return withUser(db(), userId, async (tx) => {
    const discs = await tx
      .select({ id: s.enrolledDisciplines.id, name: s.enrolledDisciplines.name })
      .from(s.enrolledDisciplines)
      .innerJoin(s.studentTerms, eq(s.studentTerms.id, s.enrolledDisciplines.termId))
      .where(
        and(
          eq(s.enrolledDisciplines.ownerId, userId),
          eq(s.studentTerms.isCurrent, true),
          isNull(s.enrolledDisciplines.archivedAt),
        ),
      )
      .orderBy(asc(s.enrolledDisciplines.createdAt));
    const out = [];
    for (const d of discs) {
      const dto = await load(tx, userId, d.id);
      out.push({ id: d.id, name: d.name, summary: dto.summary });
    }
    return out;
  });
}
