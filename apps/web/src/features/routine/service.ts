import 'server-only';
import {
  durationBetween,
  goalStatus,
  hmToMinute,
  localDayKey,
  minuteToHm,
  PERSONAL_CATEGORIES,
  projectAgenda,
  routineConflicts,
  routineSeries,
  routineSummary,
  weekBounds,
  weekStart,
  type RoutineBlock,
  type SingleItem,
} from '@gutta/core';
import type { routine as contract } from '@gutta/contracts';
import { and, asc, eq, gte, isNull, lt, or, schema as s, sql, withUser, type Tx } from '@gutta/db';
import type { z } from 'zod';
import { ApiError, badRequest, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';

// Rotina semanal (SPEC v2, ROT-01 a ROT-12 e ROT-17). A grade mostra uma semana real: os
// blocos que se repetem e as aulas do cronograma daquela semana. Só os blocos se editam aqui;
// a aula do cronograma é protegida (ROT-05).

type Body = z.output<typeof contract.routineBlockBody>;
type BlockRow = typeof s.routineBlocks.$inferSelect;
type Prefs = contract.PreferencesDto;

const DEFAULT_PREFS: Prefs = {
  weeklyGoalMinutes: 1200,
  gridStepMinutes: 60,
  viewStartMinute: 480,
  viewEndMinute: 1440,
};
const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Vale com a chave "rotina" ou dentro do cadastro (passo "Minha rotina"). */
export async function assertRoutineEnabled() {
  const on = await flags();
  if (!on.cadastro && !on.rotina) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function timezone(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return p?.timezone ?? 'America/Sao_Paulo';
}

async function prefsOf(tx: Tx, userId: string): Promise<Prefs> {
  const row = await tx.query.planningPreferences.findFirst({
    where: eq(s.planningPreferences.userId, userId),
  });
  if (!row) return DEFAULT_PREFS;
  return {
    weeklyGoalMinutes: row.weeklyGoalMinutes,
    gridStepMinutes: row.gridStepMinutes as Prefs['gridStepMinutes'],
    viewStartMinute: row.viewStartMinute,
    viewEndMinute: row.viewEndMinute,
  };
}

function toCore(b: BlockRow): RoutineBlock {
  return {
    id: b.id,
    kind: b.kind,
    category: b.category,
    label: b.label,
    disciplineId: b.disciplineId,
    color: b.color,
    weekdays: b.weekdays,
    startMinute: b.startMinute,
    durationMinutes: b.durationMinutes,
    validFrom: b.validFrom,
    validUntil: b.validUntil,
  };
}

function toDto(b: BlockRow): contract.RoutineBlockDto {
  return {
    id: b.id,
    kind: b.kind,
    category: b.category,
    label: b.label,
    disciplineId: b.disciplineId,
    color: b.color,
    weekdays: [...b.weekdays].sort(),
    start: minuteToHm(b.startMinute),
    end: minuteToHm(b.startMinute + b.durationMinutes),
    durationMinutes: b.durationMinutes,
  };
}

async function activeBlocks(tx: Tx, userId: string, from?: string) {
  return tx
    .select()
    .from(s.routineBlocks)
    .where(
      and(
        eq(s.routineBlocks.ownerId, userId),
        from
          ? or(isNull(s.routineBlocks.validUntil), gte(s.routineBlocks.validUntil, from))
          : undefined,
      ),
    )
    .orderBy(asc(s.routineBlocks.startMinute), asc(s.routineBlocks.createdAt));
}

async function currentDisciplines(tx: Tx, userId: string) {
  return tx
    .select({
      id: s.enrolledDisciplines.id,
      name: s.enrolledDisciplines.name,
      shortName: s.enrolledDisciplines.shortName,
      color: s.enrolledDisciplines.color,
    })
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
}

/** Semana a mostrar: a pedida; senão a atual, ou a próxima com aulas se a atual não tiver. */
async function referenceWeek(tx: Tx, userId: string, tz: string, week?: string) {
  if (week) return weekStart(week);
  const today = localDayKey(new Date(), tz);
  const current = weekStart(today);
  const { from, to } = weekBounds(current, tz);
  const [has] = await tx
    .select({ id: s.lessons.id })
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.ownerId, userId),
        gte(s.lessons.startsAt, from),
        lt(s.lessons.startsAt, to),
        isNull(s.lessons.cancelledAt),
      ),
    )
    .limit(1);
  if (has) return current;
  const [next] = await tx
    .select({ startsAt: s.lessons.startsAt })
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.ownerId, userId),
        gte(s.lessons.startsAt, to),
        isNull(s.lessons.cancelledAt),
      ),
    )
    .orderBy(asc(s.lessons.startsAt))
    .limit(1);
  return next ? weekStart(localDayKey(next.startsAt, tz)) : current;
}

export async function loadRoutine(
  tx: Tx,
  userId: string,
  week?: string,
): Promise<contract.RoutineDto> {
  const tz = await timezone(tx, userId);
  const start = await referenceWeek(tx, userId, tz, week);
  const bounds = weekBounds(start, tz);
  const prefs = await prefsOf(tx, userId);
  const blocks = await activeBlocks(tx, userId, start);
  const disciplines = await currentDisciplines(tx, userId);
  const lessonRows = await tx
    .select()
    .from(s.lessons)
    .where(
      and(
        eq(s.lessons.ownerId, userId),
        lt(s.lessons.startsAt, bounds.to),
        // Dia inteiro ou com fim: pega também o que começou antes e entra na semana.
        or(gte(s.lessons.startsAt, bounds.from), gte(s.lessons.endsAt, bounds.from)),
        isNull(s.lessons.cancelledAt),
      ),
    )
    .orderBy(asc(s.lessons.startsAt));
  const singles: SingleItem[] = lessonRows.map((l) => ({
    source: 'lesson',
    sourceId: l.id,
    kind: l.kind === 'outro' ? 'outro' : l.kind,
    title: l.title,
    disciplineId: l.disciplineId,
    protected: true,
    blocksTime: l.kind !== 'outro',
    start: l.startsAt,
    end: l.endsAt,
    allDay: l.allDay,
  }));
  const occ = projectAgenda({
    tz,
    from: bounds.from,
    to: bounds.to,
    singles,
    series: blocks.map((b) => routineSeries(toCore(b))),
  });
  const summary = routineSummary(occ, bounds.from, bounds.to);
  const goal = goalStatus(prefs.weeklyGoalMinutes, summary.studyMinutes);
  const hm = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  return {
    week: { start, days: bounds.days },
    blocks: blocks.map(toDto),
    lessons: occ
      .filter((o) => o.source === 'lesson')
      .map((o) => {
        const row = lessonRows.find((l) => l.id === o.sourceId)!;
        return {
          id: row.id,
          kind: row.kind,
          title: row.title,
          disciplineId: row.disciplineId,
          date: o.date,
          start: hm(o.start),
          end: row.endsAt ? hm(row.endsAt) : null,
          allDay: row.allDay,
        };
      }),
    disciplines,
    preferences: prefs,
    summary,
    goal,
  };
}

export async function getRoutine(userId: string, week?: string) {
  await assertRoutineEnabled();
  return withUser(db(), userId, async (tx) => ({ routine: await loadRoutine(tx, userId, week) }));
}

async function prepare(tx: Tx, userId: string, body: Body, id?: string) {
  const startMinute = hmToMinute(body.start);
  const endMinute = hmToMinute(body.end);
  if (startMinute === null || endMinute === null) throw badRequest('Hora inválida.');
  const durationMinutes = durationBetween(startMinute, endMinute);
  const weekdays = [...new Set(body.weekdays)].sort();

  let label = body.label ?? '';
  let disciplineId: string | null = null;
  let category: string | null = null;
  if (body.kind === 'aula') {
    const d = (await currentDisciplines(tx, userId)).find((x) => x.id === body.disciplineId);
    if (!d) throw notFound('Disciplina');
    disciplineId = d.id;
    label = d.shortName || d.name;
  } else if (body.kind === 'estudo') {
    label = label || 'Estudo';
  } else {
    category = body.category;
    const known = PERSONAL_CATEGORIES.find((c) => c.key === category);
    label = category === 'personalizada' ? label : label || known?.label || 'Atividade';
  }

  const others = (await activeBlocks(tx, userId)).filter((b) => b.validUntil === null);
  const clash = routineConflicts(
    { id, weekdays, startMinute, durationMinutes },
    others.map(toCore),
  );
  if (clash.length) {
    const c = clash[0]!;
    const day = weekdays.find((w) => c.weekdays.includes(w)) ?? c.weekdays[0]!;
    throw conflict(
      `Esse horário já tem ${c.label} (${WEEKDAY[day]}, ${minuteToHm(c.startMinute)} às ${minuteToHm(c.startMinute + c.durationMinutes)}). Ajuste um dos dois.`,
    );
  }
  return {
    kind: body.kind,
    category,
    label,
    disciplineId,
    color: body.kind === 'pessoal' && category === 'personalizada' ? body.color : null,
    weekdays,
    startMinute,
    durationMinutes,
  };
}

export async function createBlock(userId: string, body: Body) {
  await assertRoutineEnabled();
  return withUser(db(), userId, async (tx) => {
    const values = await prepare(tx, userId, body);
    const tz = await timezone(tx, userId);
    // Vale desde o domingo desta semana: a grade mostra a semana inteira.
    const validFrom = weekStart(localDayKey(new Date(), tz));
    const [row] = await tx
      .insert(s.routineBlocks)
      .values({ ownerId: userId, validFrom, ...values })
      .returning();
    return { block: toDto(row!) };
  });
}

async function findOwn(tx: Tx, userId: string, id: string) {
  const row = await tx.query.routineBlocks.findFirst({
    where: and(eq(s.routineBlocks.id, id), eq(s.routineBlocks.ownerId, userId)),
  });
  if (!row) throw notFound('Atividade');
  return row;
}

export async function updateBlock(userId: string, id: string, body: Body) {
  await assertRoutineEnabled();
  return withUser(db(), userId, async (tx) => {
    await findOwn(tx, userId, id);
    const values = await prepare(tx, userId, body, id);
    const [row] = await tx
      .update(s.routineBlocks)
      .set(values)
      .where(eq(s.routineBlocks.id, id))
      .returning();
    return { block: toDto(row!) };
  });
}

export async function removeBlock(userId: string, id: string, weekday?: number) {
  await assertRoutineEnabled();
  await withUser(db(), userId, async (tx) => {
    const row = await findOwn(tx, userId, id);
    const rest = row.weekdays.filter((w) => w !== weekday);
    if (weekday !== undefined && rest.length > 0 && rest.length < row.weekdays.length) {
      await tx.update(s.routineBlocks).set({ weekdays: rest }).where(eq(s.routineBlocks.id, id));
    } else {
      await tx.delete(s.routineBlocks).where(eq(s.routineBlocks.id, id));
    }
  });
  return { ok: true as const };
}

export async function savePreferences(userId: string, prefs: Prefs) {
  await assertRoutineEnabled();
  return withUser(db(), userId, async (tx) => {
    await tx
      .insert(s.planningPreferences)
      .values({ userId, ...prefs })
      .onConflictDoUpdate({ target: s.planningPreferences.userId, set: prefs });
    return { preferences: await prefsOf(tx, userId) };
  });
}

/** Passo "Minha rotina" do cadastro (CAD-05): avança sem exigir a meta. */
export async function confirmRoutine(tx: Tx, userId: string) {
  await tx
    .insert(s.planningPreferences)
    .values({ userId, routineConfirmedAt: sql`now()` })
    .onConflictDoUpdate({
      target: s.planningPreferences.userId,
      set: {
        routineConfirmedAt: sql`coalesce(${s.planningPreferences.routineConfirmedAt}, now())`,
      },
    });
}

export async function routineConfirmed(tx: Tx, userId: string) {
  const row = await tx.query.planningPreferences.findFirst({
    where: eq(s.planningPreferences.userId, userId),
    columns: { routineConfirmedAt: true },
  });
  return Boolean(row?.routineConfirmedAt);
}
