import 'server-only';
import {
  DEFAULT_PREFERENCES,
  addDays,
  localDayKey,
  overlaps,
  planWeek,
  weekBalance,
  weekStart,
  zonedTimeToUtc,
  type Interval,
  type Occurrence,
  type PlannerInput,
  type PlannerTask,
  type ReasonCode,
  type Unplaced,
} from '@gutta/core';
import type { planning as contract } from '@gutta/contracts';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import type { z } from 'zod';
import { ApiError, badRequest, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { agendaOccurrences, userTimezone } from '@/features/agenda/service';
import { flags } from '@/features/flags/service';

// Equilíbrio (SPEC v2, 5.4 e 7.5). Monta a entrada do motor a partir da agenda única, guarda a
// proposta com a entrada (reproduzível) e só cria sessão na agenda depois da confirmação (R10).
// Tudo como o dono (withUser), com o filtro do dono explícito, além do RLS.

type Prefs = contract.PreferencesDto;
type TaskRow = typeof s.studyTasks.$inferSelect;
type SessionRow = typeof s.studySessions.$inferSelect;

const MIN = 60_000;
const LIVE = ['confirmed', 'done', 'partly_done'] as const;
const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ORDINAL_DAY = (wd: number) => (wd === 0 || wd === 6 ? 'no' : 'na');

export async function assertPlanningEnabled() {
  const on = await flags();
  if (!on.equilibrio) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

const hm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

const weekdayOf = (d: Date, tz: string) => new Date(`${localDayKey(d, tz)}T12:00:00Z`).getUTCDay();

// -------------------------------------------------------------------------------------------
// Preferências (EQU-01 a EQU-03)

async function loadPrefs(tx: Tx, userId: string): Promise<Prefs> {
  const p = await tx.query.planningPreferences.findFirst({
    where: eq(s.planningPreferences.userId, userId),
  });
  if (!p)
    return {
      ...DEFAULT_PREFERENCES,
      sessionMinutes: 30,
    };
  return {
    preferredPeriod: p.preferredPeriod,
    sessionMinutes: p.sessionMinutes as Prefs['sessionMinutes'],
    intensity: p.intensity,
    priority: p.priority,
    dailyLimitMinutes: p.dailyLimitMinutes,
    weeklyLimitMinutes: p.weeklyLimitMinutes,
    breakMinutes: p.breakMinutes,
    maxConsecutive: p.maxConsecutive,
    longBreakMinutes: p.longBreakMinutes,
    avoidAfterLongJourney: p.avoidAfterLongJourney,
  };
}

export async function getPreferences(userId: string) {
  await assertPlanningEnabled();
  return withUser(db(), userId, (tx) => loadPrefs(tx, userId));
}

export async function savePreferences(userId: string, body: Prefs) {
  await assertPlanningEnabled();
  if (body.dailyLimitMinutes !== null && body.weeklyLimitMinutes !== null)
    if (body.dailyLimitMinutes > body.weeklyLimitMinutes)
      throw badRequest('O limite diário não pode passar do semanal.');
  return withUser(db(), userId, async (tx) => {
    await tx
      .insert(s.planningPreferences)
      .values({ userId, ...body })
      .onConflictDoUpdate({
        target: s.planningPreferences.userId,
        set: { ...body, updatedAt: new Date() },
      });
    return loadPrefs(tx, userId);
  });
}

// -------------------------------------------------------------------------------------------
// Tarefas

type TaskWithMeta = TaskRow & { disciplineName: string | null; plannedMinutes: number };

async function loadTasks(
  tx: Tx,
  userId: string,
  where?: ReturnType<typeof and>,
): Promise<TaskWithMeta[]> {
  const rows = await tx
    .select({ t: s.studyTasks, disciplineName: s.enrolledDisciplines.name })
    .from(s.studyTasks)
    .leftJoin(s.enrolledDisciplines, eq(s.enrolledDisciplines.id, s.studyTasks.disciplineId))
    .where(and(eq(s.studyTasks.ownerId, userId), where))
    .orderBy(sql`${s.studyTasks.dueAt} asc nulls last`, asc(s.studyTasks.createdAt));
  if (!rows.length) return [];
  // Minutos já reservados em sessões confirmadas (passadas sem registro também: o aluno decide
  // o que fazer com elas, EQU-14).
  const held = await tx
    .select({
      taskId: s.studySessions.taskId,
      minutes: sql<number>`coalesce(sum(extract(epoch from (${s.studySessions.endsAt} - ${s.studySessions.startsAt})) / 60), 0)::int`,
    })
    .from(s.studySessions)
    .where(
      and(
        eq(s.studySessions.ownerId, userId),
        eq(s.studySessions.status, 'confirmed'),
        inArray(
          s.studySessions.taskId,
          rows.map((r) => r.t.id),
        ),
      ),
    )
    .groupBy(s.studySessions.taskId);
  const byTask = new Map(held.map((h) => [h.taskId, h.minutes]));
  return rows.map((r) => ({
    ...r.t,
    disciplineName: r.disciplineName ?? null,
    plannedMinutes: byTask.get(r.t.id) ?? 0,
  }));
}

function taskDto(t: TaskWithMeta, tz: string): contract.TaskDto {
  return {
    id: t.id,
    title: t.title,
    disciplineId: t.disciplineId,
    disciplineName: t.disciplineName,
    origin: t.origin,
    status: t.status,
    estimatedMinutes: t.estimatedMinutes,
    doneMinutes: t.doneMinutes,
    plannedMinutes: t.plannedMinutes,
    dueAt: t.dueAt?.toISOString() ?? null,
    dueDate: t.dueAt ? localDayKey(t.dueAt, tz) : null,
    difficulty: t.difficulty,
    importance: t.importance,
    lessonId: t.lessonId,
    assessmentId: t.assessmentId,
  };
}

const remaining = (t: TaskWithMeta) =>
  Math.max(0, t.estimatedMinutes - t.doneMinutes - t.plannedMinutes);

async function oneTask(tx: Tx, userId: string, id: string, tz: string) {
  const [t] = await loadTasks(tx, userId, eq(s.studyTasks.id, id));
  if (!t) throw notFound('Tarefa');
  return taskDto(t, tz);
}

export async function listTasks(userId: string, q: { status?: contract.TaskDto['status'] }) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const rows = await loadTasks(
      tx,
      userId,
      q.status ? eq(s.studyTasks.status, q.status) : undefined,
    );
    return { items: rows.map((t) => taskDto(t, tz)) };
  });
}

async function ownDiscipline(tx: Tx, userId: string, id: string | null) {
  if (!id) return null;
  const d = await tx.query.enrolledDisciplines.findFirst({
    where: and(eq(s.enrolledDisciplines.id, id), eq(s.enrolledDisciplines.ownerId, userId)),
  });
  if (!d) throw notFound('Disciplina');
  return d;
}

export async function createTask(
  userId: string,
  body: z.output<(typeof contract.createTask)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    await ownDiscipline(tx, userId, body.disciplineId);
    const [t] = await tx
      .insert(s.studyTasks)
      .values({
        ownerId: userId,
        title: body.title,
        disciplineId: body.disciplineId,
        estimatedMinutes: body.estimatedMinutes,
        // Prazo no fim do dia escolhido.
        dueAt: body.dueDate ? zonedTimeToUtc(body.dueDate, tz, 23, 59) : null,
        difficulty: body.difficulty,
        importance: body.importance,
        origin: 'aluno',
      })
      .returning();
    return oneTask(tx, userId, t!.id, tz);
  });
}

export async function updateTask(
  userId: string,
  id: string,
  body: z.output<(typeof contract.updateTask)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const [t] = await tx
      .update(s.studyTasks)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(s.studyTasks.id, id), eq(s.studyTasks.ownerId, userId)))
      .returning();
    if (!t) throw notFound('Tarefa');
    // Tarefa descartada ou adiada sai da agenda futura (sessões ainda não feitas).
    if (body.status === 'descartada' || body.status === 'adiada')
      await tx
        .delete(s.studySessions)
        .where(
          and(
            eq(s.studySessions.ownerId, userId),
            eq(s.studySessions.taskId, id),
            inArray(s.studySessions.status, ['proposed', 'confirmed']),
            gt(s.studySessions.startsAt, new Date()),
          ),
        );
    return oneTask(tx, userId, id, tz);
  });
}

/**
 * Pedidos de outros módulos (EQU-18). Cada pedido vira uma tarefa só (`source_ref`); pedir de
 * novo reabre a mesma. Nada entra na agenda aqui: a tarefa espera a próxima proposta.
 */
export async function createRequest(
  userId: string,
  body: z.output<(typeof contract.createRequest)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const id = await requestTask(tx, userId, body.kind, body.id);
    return oneTask(tx, userId, id, tz);
  });
}

export async function requestTask(
  tx: Tx,
  userId: string,
  kind: 'aula' | 'falta' | 'prova' | 'nota',
  refId: string,
): Promise<string> {
  const sourceRef = `${kind}:${refId}`;
  let values: typeof s.studyTasks.$inferInsert;
  if (kind === 'aula') {
    const l = await tx.query.lessons.findFirst({
      where: and(eq(s.lessons.id, refId), eq(s.lessons.ownerId, userId)),
    });
    if (!l) throw notFound('Aula');
    const p = await tx.query.lessonProgress.findFirst({
      where: and(eq(s.lessonProgress.lessonId, refId), eq(s.lessonProgress.ownerId, userId)),
    });
    const [marks] = await tx
      .select({ high: sql<number>`count(*) filter (where importance = 'alta')::int` })
      .from(s.contentMarks)
      .where(and(eq(s.contentMarks.ownerId, userId), eq(s.contentMarks.lessonId, refId)));
    values = {
      ownerId: userId,
      title: `Revisão: ${l.title}`,
      disciplineId: l.disciplineId,
      lessonId: l.id,
      topicId: l.topicId,
      estimatedMinutes: 30,
      origin: 'aula',
      difficulty:
        p?.overallDifficulty === 'dificil'
          ? 'dificil'
          : p?.overallDifficulty === 'moderada'
            ? 'moderado'
            : p?.overallDifficulty === 'facil'
              ? 'facil'
              : null,
      importance: (marks?.high ?? 0) > 0 ? 'alta' : null,
      sourceRef,
    };
  } else if (kind === 'falta') {
    const a = await tx.query.absences.findFirst({
      where: and(eq(s.absences.id, refId), eq(s.absences.ownerId, userId)),
    });
    if (!a) throw notFound('Falta');
    const l = a.lessonId
      ? await tx.query.lessons.findFirst({ where: eq(s.lessons.id, a.lessonId) })
      : null;
    values = {
      ownerId: userId,
      title: `Revisão da aula perdida${l ? `: ${l.title}` : ''}`,
      disciplineId: a.disciplineId,
      lessonId: a.lessonId,
      topicId: l?.topicId ?? null,
      estimatedMinutes: 30,
      origin: 'falta',
      sourceRef,
    };
  } else {
    const a = await tx.query.assessments.findFirst({
      where: and(eq(s.assessments.id, refId), eq(s.assessments.ownerId, userId)),
    });
    if (!a) throw notFound('Avaliação');
    values =
      kind === 'prova'
        ? {
            ownerId: userId,
            title: `Revisão para ${a.name}`,
            disciplineId: a.disciplineId,
            assessmentId: a.id,
            estimatedMinutes: 120,
            dueAt: a.dueAt,
            origin: 'prova',
            importance: 'alta',
            sourceRef,
          }
        : {
            ownerId: userId,
            title: `Revisão do conteúdo de ${a.name}`,
            disciplineId: a.disciplineId,
            assessmentId: a.id,
            estimatedMinutes: 30,
            origin: 'nota',
            importance: 'importante',
            sourceRef,
          };
  }
  const [row] = await tx
    .insert(s.studyTasks)
    .values(values)
    .onConflictDoUpdate({
      target: [s.studyTasks.ownerId, s.studyTasks.sourceRef],
      targetWhere: sql`source_ref is not null`,
      // Pedir de novo reabre a tarefa, sem duplicar.
      set: { status: 'pendente', updatedAt: new Date() },
    })
    .returning({ id: s.studyTasks.id });
  return row!.id;
}

// -------------------------------------------------------------------------------------------
// Sessões

type SessionMeta = SessionRow & {
  disciplineName: string | null;
  task: TaskRow | null;
  assessmentName: string | null;
};

async function loadSessions(tx: Tx, userId: string, where: ReturnType<typeof and>) {
  const rows = await tx
    .select({
      x: s.studySessions,
      task: s.studyTasks,
      disciplineName: s.enrolledDisciplines.name,
      assessmentName: s.assessments.name,
    })
    .from(s.studySessions)
    .leftJoin(s.studyTasks, eq(s.studyTasks.id, s.studySessions.taskId))
    .leftJoin(s.enrolledDisciplines, eq(s.enrolledDisciplines.id, s.studySessions.disciplineId))
    .leftJoin(s.assessments, eq(s.assessments.id, s.studyTasks.assessmentId))
    .where(and(eq(s.studySessions.ownerId, userId), where))
    .orderBy(asc(s.studySessions.startsAt));
  return rows.map((r): SessionMeta => ({
    ...r.x,
    task: r.task,
    disciplineName: r.disciplineName ?? null,
    assessmentName: r.assessmentName ?? null,
  }));
}

/** Motivo em linguagem simples (R11, EQU-08): "Prova de BMF na quinta". */
function reasonTexts(x: SessionMeta, tz: string): string[] {
  const t = x.task;
  const out: string[] = [];
  const disc = x.disciplineName ? ` de ${x.disciplineName}` : '';
  for (const code of x.reasonCodes as ReasonCode[]) {
    if (code === 'prova_proxima' && t?.dueAt) {
      const wd = weekdayOf(t.dueAt, tz);
      out.push(`${x.assessmentName ?? 'Prova'}${disc} ${ORDINAL_DAY(wd)} ${WEEKDAY[wd]}`);
    } else if (code === 'prazo_proximo' && t?.dueAt) {
      const wd = weekdayOf(t.dueAt, tz);
      out.push(`Prazo ${ORDINAL_DAY(wd)} ${WEEKDAY[wd]}`);
    } else if (code === 'dificil')
      out.push(
        t?.origin === 'aula'
          ? 'Você marcou esta aula como difícil'
          : 'Conteúdo marcado como difícil',
      );
    else if (code === 'importante') out.push('Conteúdo marcado como importante');
    else if (code === 'origem_aula') out.push('Revisão que você pediu ao concluir a aula');
    else if (code === 'origem_falta') out.push('Revisão da aula perdida');
    else if (code === 'origem_nota') out.push('Revisão do conteúdo da avaliação');
    else if (code === 'origem_aluno') out.push('Tarefa que você criou');
    else if (code === 'origem_memory') out.push('Revisão espaçada');
    else if (code === 'periodo_preferido') out.push('No período que você prefere');
  }
  return out;
}

function sessionDto(x: SessionMeta, tz: string): contract.SessionDto {
  return {
    id: x.id,
    taskId: x.taskId,
    proposalId: x.proposalId,
    title: x.title,
    disciplineId: x.disciplineId,
    disciplineName: x.disciplineName,
    start: x.startsAt.toISOString(),
    end: x.endsAt.toISOString(),
    date: localDayKey(x.startsAt, tz),
    startLocal: hm(x.startsAt, tz),
    endLocal: hm(x.endsAt, tz),
    minutes: Math.round((x.endsAt.getTime() - x.startsAt.getTime()) / MIN),
    status: x.status,
    reasons: reasonTexts(x, tz),
    part: x.part,
    parts: x.parts,
    doneMinutes: x.doneMinutes,
  };
}

async function oneSession(tx: Tx, userId: string, id: string, tz: string) {
  const [x] = await loadSessions(tx, userId, eq(s.studySessions.id, id));
  if (!x) throw notFound('Sessão');
  return sessionDto(x, tz);
}

// -------------------------------------------------------------------------------------------
// Entrada do motor a partir da agenda única

type WeekContext = {
  tz: string;
  start: string;
  from: Date;
  to: Date;
  occ: Occurrence[];
  windows: Interval[];
  busy: (Interval & { title: string })[];
  classes: Interval[];
};

async function weekContext(tx: Tx, userId: string, semana?: string): Promise<WeekContext> {
  const tz = await userTimezone(tx, userId);
  const start = weekStart(semana ?? localDayKey(new Date(), tz));
  const from = zonedTimeToUtc(start, tz);
  const to = zonedTimeToUtc(addDays(start, 7), tz);
  const occ = await agendaOccurrences(tx, userId, tz, from, to);
  const span = (o: Occurrence) => ({ start: o.start.getTime(), end: o.end.getTime() });
  return {
    tz,
    start,
    from,
    to,
    occ,
    windows: occ.filter((o) => o.studyWindow).map(span),
    // Tudo o que ocupa horário, menos as sessões (essas entram como confirmadas).
    busy: occ
      .filter(
        (o) =>
          !o.studyWindow &&
          o.source !== 'session' &&
          (o.protected || o.blocksTime) &&
          o.end > o.start &&
          !o.allDay,
      )
      .map((o) => ({ ...span(o), title: o.title })),
    classes: occ
      .filter(
        (o) =>
          (o.source === 'lesson' && (o.kind === 'aula' || o.kind === 'pratica')) ||
          (o.source === 'routine' && o.kind === 'aula'),
      )
      .map(span),
  };
}

const UNPLACED_TEXT: Record<Unplaced['reason'], string> = {
  prazo:
    'Não há horário de estudo livre antes do prazo. Dá para reduzir a duração ou abrir uma janela de estudo antes.',
  limite_diario: 'Os limites diários que você definiu já foram usados nos dias possíveis.',
  limite_semanal:
    'O limite semanal que você definiu foi atingido. Dá para adiar para a próxima semana.',
  intensidade:
    'A intensidade escolhida deixa parte das janelas livre de propósito. Se quiser, adie, reduza ou mude a intensidade.',
  sem_horario:
    'As janelas de estudo desta semana acabaram. Dá para adiar ou abrir mais uma janela na rotina.',
};

async function proposalDto(
  tx: Tx,
  userId: string,
  p: typeof s.planProposals.$inferSelect,
  tz: string,
): Promise<contract.ProposalDto> {
  const sessions = await loadSessions(tx, userId, eq(s.studySessions.proposalId, p.id));
  const unplaced = (p.unplaced as Unplaced[]) ?? [];
  const titles = unplaced.length
    ? await tx
        .select({ id: s.studyTasks.id, title: s.studyTasks.title })
        .from(s.studyTasks)
        .where(
          inArray(
            s.studyTasks.id,
            unplaced.map((u) => u.taskId),
          ),
        )
    : [];
  const cap = p.capacity as contract.ProposalDto['capacity'];
  return {
    id: p.id,
    weekStart: p.weekStart,
    kind: p.kind,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    sessions: sessions
      .filter((x) => p.status !== 'proposed' || x.status === 'proposed')
      .map((x) => sessionDto(x, tz)),
    unplaced: unplaced.map((u) => ({
      taskId: u.taskId,
      title: titles.find((t) => t.id === u.taskId)?.title ?? 'Tarefa',
      minutes: u.minutes,
      reason: u.reason,
      explanation: UNPLACED_TEXT[u.reason],
    })),
    capacity: {
      windowMinutes: cap.windowMinutes ?? 0,
      usableMinutes: cap.usableMinutes ?? 0,
      proposedMinutes: cap.proposedMinutes ?? 0,
    },
  };
}

/**
 * Gera a proposta da semana (EQU-06) ou o replanejamento (EQU-12). A proposta anterior ainda
 * aberta da mesma semana é substituída. Nada entra na agenda aqui.
 */
export async function createProposal(
  userId: string,
  body: z.output<(typeof contract.createProposal)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const ctx = await weekContext(tx, userId, body.semana);
    const prefs = await loadPrefs(tx, userId);
    const now = Date.now();
    const from = Math.max(ctx.from.getTime(), now);
    if (from >= ctx.to.getTime()) throw badRequest('Esta semana já terminou.');

    // Sessões já marcadas na semana (as que serão replanejadas saem desta lista).
    const live = await loadSessions(
      tx,
      userId,
      and(
        inArray(s.studySessions.status, [...LIVE]),
        lt(s.studySessions.startsAt, ctx.to),
        gt(s.studySessions.endsAt, ctx.from),
      ),
    );

    let tasks: PlannerTask[];
    let replaces: string[] = [];
    let budget: number | undefined;
    if (body.kind === 'replanejar') {
      // O que reorganizar: as escolhidas, ou as que ficaram para trás e as ainda por vir.
      const candidates = await loadSessions(
        tx,
        userId,
        and(
          eq(s.studySessions.status, 'confirmed'),
          body.sessionIds?.length
            ? inArray(s.studySessions.id, body.sessionIds)
            : and(
                gt(s.studySessions.endsAt, new Date(now - 14 * 24 * 60 * MIN)),
                lt(s.studySessions.startsAt, ctx.to),
              ),
        ),
      );
      const withTask = candidates.filter((x) => x.task && x.task.status === 'pendente');
      if (!withTask.length) throw badRequest('Não há sessões para reorganizar.');
      replaces = withTask.map((x) => x.id);
      const perTask = new Map<string, number>();
      for (const x of withTask) {
        const m = Math.round((x.endsAt.getTime() - x.startsAt.getTime()) / MIN);
        perTask.set(x.taskId!, (perTask.get(x.taskId!) ?? 0) + m);
      }
      // O total nunca aumenta sozinho (critério 7): o teto é o que já estava marcado.
      budget = [...perTask.values()].reduce((n, m) => n + m, 0);
      tasks = withTask
        .filter((x, i, all) => all.findIndex((y) => y.taskId === x.taskId) === i)
        .map((x) => plannerTask(x.task!, perTask.get(x.taskId!)!));
    } else {
      const pending = await loadTasks(tx, userId, eq(s.studyTasks.status, 'pendente'));
      tasks = pending
        .filter((t) => remaining(t) > 0 && (!t.dueAt || t.dueAt.getTime() > now))
        .map((t) => plannerTask(t, remaining(t)));
    }

    const confirmed = live
      .filter((x) => !replaces.includes(x.id))
      .map((x) => ({ start: x.startsAt.getTime(), end: x.endsAt.getTime() }));
    const input: PlannerInput = {
      tz: ctx.tz,
      from,
      to: ctx.to.getTime(),
      studyWindows: ctx.windows,
      busy: ctx.busy.map(({ start, end }) => ({ start, end })),
      classes: ctx.classes,
      confirmed,
      prefs: { ...DEFAULT_PREFERENCES, ...prefs },
      tasks,
      variant: body.variant ?? 0,
      maxTotalMinutes: budget,
    };
    const out = planWeek(input);

    // A proposta aberta anterior da mesma semana é substituída.
    const open = await tx
      .select({ id: s.planProposals.id })
      .from(s.planProposals)
      .where(
        and(
          eq(s.planProposals.ownerId, userId),
          eq(s.planProposals.weekStart, ctx.start),
          eq(s.planProposals.status, 'proposed'),
        ),
      );
    if (open.length) {
      const ids = open.map((o) => o.id);
      await tx
        .delete(s.studySessions)
        .where(
          and(
            eq(s.studySessions.ownerId, userId),
            inArray(s.studySessions.proposalId, ids),
            eq(s.studySessions.status, 'proposed'),
          ),
        );
      await tx
        .update(s.planProposals)
        .set({ status: 'superseded', decidedAt: new Date() })
        .where(inArray(s.planProposals.id, ids));
    }

    const [p] = await tx
      .insert(s.planProposals)
      .values({
        ownerId: userId,
        weekStart: ctx.start,
        kind: body.kind,
        algorithmVersion: out.version,
        variant: body.variant ?? 0,
        inputSnapshot: { ...input, replaces },
        unplaced: out.unplaced,
        capacity: out.capacity,
      })
      .returning();
    const taskById = new Map<string, { title: string; disciplineId: string | null }>();
    for (const t of await tx
      .select({
        id: s.studyTasks.id,
        title: s.studyTasks.title,
        disciplineId: s.studyTasks.disciplineId,
      })
      .from(s.studyTasks)
      .where(
        and(
          eq(s.studyTasks.ownerId, userId),
          inArray(s.studyTasks.id, tasks.length ? tasks.map((t) => t.id) : [p!.id]),
        ),
      ))
      taskById.set(t.id, t);
    if (out.sessions.length)
      await tx.insert(s.studySessions).values(
        out.sessions.map((x) => ({
          ownerId: userId,
          proposalId: p!.id,
          taskId: x.taskId,
          disciplineId: taskById.get(x.taskId)?.disciplineId ?? null,
          title: taskById.get(x.taskId)?.title ?? 'Estudo',
          startsAt: new Date(x.start),
          endsAt: new Date(x.end),
          status: 'proposed' as const,
          reasonCodes: x.reasons,
          part: x.part,
          parts: x.parts,
        })),
      );
    return proposalDto(tx, userId, p!, ctx.tz);
  });
}

function plannerTask(t: TaskRow, minutes: number): PlannerTask {
  return {
    id: t.id,
    disciplineId: t.disciplineId,
    remainingMinutes: minutes,
    dueAt: t.dueAt?.getTime() ?? null,
    difficulty: t.difficulty,
    importance: t.importance,
    origin: t.origin,
  };
}

/**
 * Decisão do aluno (EQU-07): as sessões escolhidas viram confirmadas e entram na agenda; as
 * outras saem. Uma sessão que passou a cruzar com algo marcado depois da proposta não entra.
 */
export async function decideProposal(
  userId: string,
  id: string,
  body: z.output<(typeof contract.decideProposal)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const [p] = await tx
      .select()
      .from(s.planProposals)
      .where(and(eq(s.planProposals.id, id), eq(s.planProposals.ownerId, userId)))
      .for('update');
    if (!p) throw notFound('Proposta');
    if (p.status !== 'proposed') {
      // Repetição da mesma decisão: devolve o que já foi decidido.
      const n = await tx
        .select({ id: s.studySessions.id })
        .from(s.studySessions)
        .where(and(eq(s.studySessions.proposalId, id), ne(s.studySessions.status, 'proposed')));
      return { status: p.status, confirmed: n.length };
    }
    const proposed = await tx
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.proposalId, id), eq(s.studySessions.status, 'proposed')));
    const chosen = proposed.filter((x) => body.accept.includes(x.id));
    const ctx = await weekContext(tx, userId, p.weekStart);
    const live = await tx
      .select()
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.ownerId, userId),
          inArray(s.studySessions.status, [...LIVE]),
          lt(s.studySessions.startsAt, ctx.to),
          gt(s.studySessions.endsAt, ctx.from),
        ),
      );
    const replaces = ((p.inputSnapshot as { replaces?: string[] }).replaces ?? []) as string[];
    const taken = live
      .filter((x) => !replaces.includes(x.id))
      .map((x) => ({ start: x.startsAt.getTime(), end: x.endsAt.getTime() }));
    let confirmedCount = 0;
    for (const x of chosen) {
      const span = { start: x.startsAt.getTime(), end: x.endsAt.getTime() };
      if ([...ctx.busy, ...taken].some((b) => overlaps(span, b))) continue;
      await tx
        .update(s.studySessions)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(eq(s.studySessions.id, x.id));
      taken.push(span);
      confirmedCount++;
    }
    await tx
      .delete(s.studySessions)
      .where(and(eq(s.studySessions.proposalId, id), eq(s.studySessions.status, 'proposed')));
    // Replanejamento aceito: as sessões antigas ficam como reagendadas, com o motivo opcional.
    if (p.kind === 'replanejar' && confirmedCount > 0 && replaces.length)
      await tx
        .update(s.studySessions)
        .set({
          status: 'rescheduled',
          rescheduleReason: body.reason ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(s.studySessions.ownerId, userId),
            inArray(s.studySessions.id, replaces),
            eq(s.studySessions.status, 'confirmed'),
          ),
        );
    const status: contract.ProposalDto['status'] =
      confirmedCount === 0
        ? 'rejected'
        : confirmedCount === proposed.length
          ? 'accepted'
          : 'partly_accepted';
    await tx
      .update(s.planProposals)
      .set({ status, decidedAt: new Date() })
      .where(eq(s.planProposals.id, id));
    return { status, confirmed: confirmedCount };
  });
}

export async function updateSession(
  userId: string,
  id: string,
  body: z.output<(typeof contract.updateSession)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const [x] = await tx
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.id, id), eq(s.studySessions.ownerId, userId)))
      .for('update');
    if (!x) throw notFound('Sessão');
    if (x.status !== 'proposed' && x.status !== 'confirmed')
      throw conflict('Esta sessão já foi registrada.');
    const date = body.date ?? localDayKey(x.startsAt, tz);
    const [h, m] = (body.start ?? hm(x.startsAt, tz)).split(':').map(Number);
    const startsAt = zonedTimeToUtc(date, tz, h!, m!);
    const minutes = body.minutes ?? Math.round((x.endsAt.getTime() - x.startsAt.getTime()) / MIN);
    const endsAt = new Date(startsAt.getTime() + minutes * MIN);
    // A edição é escolha do aluno (R10), mas nunca em cima de aula, compromisso ou outra sessão.
    const ctx = await weekContext(tx, userId, date);
    const span = { start: startsAt.getTime(), end: endsAt.getTime() };
    const hit = ctx.busy.find((b) => overlaps(span, b));
    if (hit) throw conflict(`Esse horário cruza com ${hit.title}.`);
    const others = await tx
      .select({ id: s.studySessions.id, title: s.studySessions.title })
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.ownerId, userId),
          ne(s.studySessions.id, id),
          inArray(
            s.studySessions.status,
            x.status === 'proposed' ? ['proposed', ...LIVE] : [...LIVE],
          ),
          lt(s.studySessions.startsAt, endsAt),
          gt(s.studySessions.endsAt, startsAt),
        ),
      );
    if (others.length) throw conflict(`Esse horário cruza com a sessão ${others[0]!.title}.`);
    await tx
      .update(s.studySessions)
      .set({ startsAt, endsAt, title: body.title ?? x.title, updatedAt: new Date() })
      .where(eq(s.studySessions.id, id));
    return oneSession(tx, userId, id, tz);
  });
}

/** Registro opcional (EQU-11): feita, em parte, deixada de lado (sem penalidade) ou desfazer. */
export async function markSession(
  userId: string,
  id: string,
  body: z.output<(typeof contract.markSession)['body']>,
) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const tz = await userTimezone(tx, userId);
    const [x] = await tx
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.id, id), eq(s.studySessions.ownerId, userId)))
      .for('update');
    if (!x) throw notFound('Sessão');
    if (x.status === 'proposed' || x.status === 'rescheduled')
      throw badRequest('Esta sessão não está na agenda.');
    const full = Math.round((x.endsAt.getTime() - x.startsAt.getTime()) / MIN);
    const credited = x.status === 'done' || x.status === 'partly_done' ? (x.doneMinutes ?? 0) : 0;
    const next =
      body.status === 'done'
        ? full
        : body.status === 'partly_done'
          ? Math.min(body.minutes ?? Math.round(full / 2), full)
          : 0;
    if (body.status === 'partly_done' && !body.minutes)
      throw badRequest('Informe quantos minutos você fez.');
    await tx
      .update(s.studySessions)
      .set({
        status: body.status,
        doneMinutes: body.status === 'done' || body.status === 'partly_done' ? next : null,
        updatedAt: new Date(),
      })
      .where(eq(s.studySessions.id, id));
    if (x.taskId) {
      const [t] = await tx
        .update(s.studyTasks)
        .set({
          doneMinutes: sql`greatest(0, ${s.studyTasks.doneMinutes} + ${next - credited})`,
          updatedAt: new Date(),
        })
        .where(eq(s.studyTasks.id, x.taskId))
        .returning();
      // Feito tudo o que a tarefa pedia: concluída. Desfazer reabre.
      if (t) {
        const done = t.doneMinutes >= t.estimatedMinutes;
        if (done && t.status === 'pendente')
          await tx
            .update(s.studyTasks)
            .set({ status: 'concluida' })
            .where(eq(s.studyTasks.id, t.id));
        if (!done && t.status === 'concluida')
          await tx
            .update(s.studyTasks)
            .set({ status: 'pendente' })
            .where(eq(s.studyTasks.id, t.id));
      }
    }
    return oneSession(tx, userId, id, tz);
  });
}

export async function deleteSession(userId: string, id: string) {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const [x] = await tx
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.id, id), eq(s.studySessions.ownerId, userId)));
    if (!x) throw notFound('Sessão');
    if (x.taskId && x.doneMinutes)
      await tx
        .update(s.studyTasks)
        .set({ doneMinutes: sql`greatest(0, ${s.studyTasks.doneMinutes} - ${x.doneMinutes})` })
        .where(eq(s.studyTasks.id, x.taskId));
    await tx.delete(s.studySessions).where(eq(s.studySessions.id, id));
    return { ok: true as const };
  });
}

// -------------------------------------------------------------------------------------------
// A semana

const BALANCE_TEXT = {
  equilibrada: 'Rotina equilibrada.',
  intensa:
    'Semana intensa: há muitos compromissos próximos. Vale priorizar o essencial nas sessões.',
  revisar:
    'Sua semana ficou mais ocupada do que o previsto. Quer reorganizar as atividades restantes, priorizando o mais importante?',
} as const;

export async function getWeek(userId: string, semana?: string): Promise<contract.WeekDto> {
  await assertPlanningEnabled();
  return withUser(db(), userId, async (tx) => {
    const ctx = await weekContext(tx, userId, semana);
    const tz = ctx.tz;
    const now = new Date();
    const prefs = await loadPrefs(tx, userId);
    const sessions = await loadSessions(
      tx,
      userId,
      and(
        inArray(s.studySessions.status, [...LIVE]),
        lt(s.studySessions.startsAt, ctx.to),
        gt(s.studySessions.endsAt, ctx.from),
      ),
    );
    const behind = await loadSessions(
      tx,
      userId,
      and(
        eq(s.studySessions.status, 'confirmed'),
        lt(s.studySessions.endsAt, now),
        gt(s.studySessions.endsAt, new Date(now.getTime() - 28 * 24 * 60 * MIN)),
      ),
    );
    const [open] = await tx
      .select()
      .from(s.planProposals)
      .where(
        and(
          eq(s.planProposals.ownerId, userId),
          eq(s.planProposals.weekStart, ctx.start),
          eq(s.planProposals.status, 'proposed'),
        ),
      )
      .orderBy(desc(s.planProposals.createdAt))
      .limit(1);
    const proposal = open ? await proposalDto(tx, userId, open, tz) : null;
    const tasks = await loadTasks(tx, userId, eq(s.studyTasks.status, 'pendente'));

    // Indicadores (EQU-10).
    const minutesOf = (x: { startsAt: Date; endsAt: Date }) =>
      Math.round((x.endsAt.getTime() - x.startsAt.getTime()) / MIN);
    const availableMinutes = ctx.windows.reduce(
      (n, w) => n + Math.round((w.end - w.start) / MIN),
      0,
    );
    const plannedMinutes = sessions.reduce((n, x) => n + minutesOf(x), 0);
    const doneMinutes = sessions.reduce((n, x) => n + (x.doneMinutes ?? 0), 0);

    // "Minha semana está equilibrada?" (EQU-16, 6.4): reflete só a agenda.
    const conflicts = sessions.some(
      (x) =>
        x.status === 'confirmed' &&
        ctx.busy.some((b) => overlaps({ start: x.startsAt.getTime(), end: x.endsAt.getTime() }, b)),
    );
    const busyMinutes = ctx.occ
      .filter(
        (o) =>
          (o.source === 'lesson' && o.kind !== 'outro') ||
          (o.source === 'routine' && o.kind === 'aula') ||
          (o.source === 'event' && o.kind === 'compromisso' && o.blocksTime),
      )
      .reduce((n, o) => n + Math.round((o.end.getTime() - o.start.getTime()) / MIN), 0);
    const state = weekBalance({
      assessments: ctx.occ
        .filter((o) => o.source === 'assessment' && o.kind === 'prova')
        .map((o) => o.start.getTime()),
      busyMinutes,
      needsReview: conflicts || Boolean(proposal?.unplaced.length),
    });

    return {
      weekStart: ctx.start,
      days: Array.from({ length: 7 }, (_, i) => addDays(ctx.start, i)),
      today: localDayKey(now, tz),
      indicators: { availableMinutes, plannedMinutes, doneMinutes },
      balance: { state, message: BALANCE_TEXT[state] },
      sessions: sessions.map((x) => sessionDto(x, tz)),
      behind: behind.map((x) => sessionDto(x, tz)),
      proposal,
      tasks: tasks.map((t) => taskDto(t, tz)),
      preferences: prefs,
      hasStudyWindows: ctx.windows.length > 0,
    };
  });
}

/** Para o Meu Espaço: o estado da semana sem carregar a página toda. */
export async function weekSummary(userId: string) {
  const on = await flags();
  if (!on.equilibrio) return null;
  const w = await getWeek(userId);
  return {
    balance: w.balance,
    indicators: w.indicators,
    next: w.sessions
      .filter((x) => x.status === 'confirmed' && x.end > new Date().toISOString())
      .slice(0, 5),
    behind: w.behind.length,
    pendingTasks: w.tasks.length,
  };
}
