import 'server-only';
import {
  MASTERY_ALGORITHM,
  SELECTION_ALGORITHM,
  estimateMastery,
  masteryBand,
  selectNextQuestion,
  type Candidate,
  type History,
  type TopicState,
} from '@gutta/core';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { track } from '@/lib/events';

export const createSessionInput = z.object({
  mode: z.enum(['practice', 'diagnostic', 'daily']).default('practice'),
  moduleId: z.uuid().optional(),
  disciplineId: z.uuid().optional(),
  topicIds: z.array(z.uuid()).max(30).optional(),
  questionId: z.uuid().optional(),
  count: z.coerce.number().int().min(1).max(30).optional(),
});

export const attemptInput = z.object({
  sessionId: z.uuid(),
  questionId: z.uuid(),
  selectedOptionId: z.uuid(),
  clientAttemptKey: z.string().min(8).max(100),
  durationSeconds: z.number().int().min(0).max(3600).optional(),
});

// Tamanho padrão por modo. O diagnóstico fica dentro da faixa da SPEC (8 a 15).
const DEFAULT_COUNT = { practice: 5, diagnostic: 8, daily: 1 } as const;

/** Assuntos que o aluno pode estudar: disciplinas do curso dele (ativas por padrão). */
async function topicsInScope(
  tx: Tx,
  userId: string,
  scope: { moduleId?: string; disciplineId?: string; topicIds?: string[] },
): Promise<string[]> {
  const profile = await tx.query.studentProfiles.findFirst({
    where: eq(s.studentProfiles.userId, userId),
  });
  if (!profile)
    throw new ApiError(409, 'onboarding_required', 'Conclua o primeiro acesso antes de estudar.');
  const courseDisciplines = await tx
    .select({ id: s.disciplines.id })
    .from(s.disciplines)
    .where(and(eq(s.disciplines.courseId, profile.courseId), eq(s.disciplines.active, true)));
  const allowed = new Set(courseDisciplines.map((d) => d.id));

  if (scope.moduleId) {
    const mod = await tx.query.modules.findFirst({ where: eq(s.modules.id, scope.moduleId) });
    if (!mod || !allowed.has(mod.disciplineId)) throw notFound('Módulo');
    const t = await tx
      .select({ id: s.topics.id })
      .from(s.topics)
      .where(sql`${s.topics.id} = ${mod.topicId} or ${s.topics.parentId} = ${mod.topicId}`);
    return t.map((r) => r.id);
  }
  if (scope.topicIds?.length) {
    const t = await tx
      .select({ id: s.topics.id, disciplineId: s.topics.disciplineId })
      .from(s.topics)
      .where(inArray(s.topics.id, scope.topicIds));
    return t.filter((r) => allowed.has(r.disciplineId)).map((r) => r.id);
  }
  let disciplineIds: string[];
  if (scope.disciplineId) {
    if (!allowed.has(scope.disciplineId)) throw notFound('Disciplina');
    disciplineIds = [scope.disciplineId];
  } else {
    const active = await tx
      .select({ id: s.studentDisciplines.disciplineId })
      .from(s.studentDisciplines)
      .where(
        and(eq(s.studentDisciplines.studentId, userId), isNull(s.studentDisciplines.activeUntil)),
      );
    disciplineIds = active.map((a) => a.id).filter((id) => allowed.has(id));
    if (disciplineIds.length === 0) disciplineIds = [...allowed];
  }
  if (disciplineIds.length === 0) return [];
  const t = await tx
    .select({ id: s.topics.id })
    .from(s.topics)
    .where(inArray(s.topics.disciplineId, disciplineIds));
  return t.map((r) => r.id);
}

export async function createSession(userId: string, input: z.infer<typeof createSessionInput>) {
  return withUser(db(), userId, async (tx) => {
    let topicIds: string[];
    if (input.questionId) {
      const q = await tx.query.questions.findFirst({
        where: and(eq(s.questions.id, input.questionId), eq(s.questions.status, 'published')),
      });
      if (!q) throw notFound('Questão');
      topicIds = [q.topicId];
    } else {
      topicIds = await topicsInScope(tx, userId, input);
    }
    if (topicIds.length === 0)
      throw new ApiError(409, 'no_content', 'Ainda não há questões publicadas para esse recorte.');
    const available = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.questions)
      .where(and(eq(s.questions.status, 'published'), inArray(s.questions.topicId, topicIds)));
    const total = available[0]?.n ?? 0;
    if (total === 0)
      throw new ApiError(409, 'no_content', 'Ainda não há questões publicadas para esse recorte.');
    const count = input.questionId ? 1 : Math.min(input.count ?? DEFAULT_COUNT[input.mode], total);
    const [session] = await tx
      .insert(s.questionSessions)
      .values({
        studentId: userId,
        mode: input.mode,
        scope: {
          ...(input.moduleId ? { moduleId: input.moduleId } : {}),
          ...(input.disciplineId ? { disciplineId: input.disciplineId } : {}),
          topicIds,
          ...(input.questionId ? { questionId: input.questionId } : {}),
        },
        targetCount: count,
        algorithmVersion: SELECTION_ALGORITHM,
      })
      .returning();
    await track(tx, userId, 'question_session_started', {
      mode: input.mode,
      count,
      scope: input.moduleId ? 'module' : input.disciplineId ? 'discipline' : 'active',
    });
    return { sessionId: session!.id, targetCount: count, mode: input.mode };
  });
}

async function loadSession(tx: Tx, sessionId: string) {
  const session = await tx.query.questionSessions.findFirst({
    where: eq(s.questionSessions.id, sessionId),
  });
  if (!session) throw notFound('Sessão');
  return session;
}

/** Próxima questão SEM gabarito: só enunciado e alternativas (SPEC §6.5). */
export async function nextQuestion(userId: string, sessionId: string) {
  return withUser(db(), userId, async (tx) => {
    const session = await loadSession(tx, sessionId);
    const done = await tx
      .select({
        questionId: s.questionAttempts.questionId,
        topicId: s.questions.topicId,
        answeredAt: s.questionAttempts.answeredAt,
      })
      .from(s.questionAttempts)
      .innerJoin(s.questions, eq(s.questions.id, s.questionAttempts.questionId))
      .where(eq(s.questionAttempts.sessionId, sessionId))
      .orderBy(asc(s.questionAttempts.answeredAt));
    const progress = { answered: done.length, total: session.targetCount };
    if (done.length >= session.targetCount || session.finishedAt) {
      return { done: true as const, progress };
    }
    const scope = session.scope as { topicIds?: string[]; questionId?: string };
    const topicIds = scope.topicIds ?? [];
    const candidatesRows = await tx
      .select({
        id: s.questions.id,
        rootId: s.questions.rootId,
        topicId: s.questions.topicId,
        difficulty: s.questions.difficulty,
      })
      .from(s.questions)
      .where(
        and(
          eq(s.questions.status, 'published'),
          scope.questionId
            ? eq(s.questions.id, scope.questionId)
            : inArray(s.questions.topicId, topicIds),
        ),
      );
    // Histórico por versão-raiz: uma questão reeditada não conta como inédita.
    const past = await tx
      .select({
        rootId: s.questions.rootId,
        answeredAt: s.questionAttempts.answeredAt,
        isCorrect: s.questionAttempts.isCorrect,
      })
      .from(s.questionAttempts)
      .innerJoin(s.questions, eq(s.questions.id, s.questionAttempts.questionId))
      .where(eq(s.questionAttempts.studentId, userId))
      .orderBy(desc(s.questionAttempts.answeredAt))
      .limit(500);
    const byRoot = new Map<string, { lastAnsweredAt: Date; lastCorrect: boolean }>();
    for (const p of past)
      if (p.rootId && !byRoot.has(p.rootId))
        byRoot.set(p.rootId, { lastAnsweredAt: p.answeredAt, lastCorrect: p.isCorrect });
    const history: History = new Map();
    for (const c of candidatesRows) {
      const h = c.rootId ? byRoot.get(c.rootId) : undefined;
      if (h) history.set(c.id, h);
    }
    const masteryRows = topicIds.length
      ? await tx.select().from(s.topicMastery).where(inArray(s.topicMastery.topicId, topicIds))
      : [];
    const mastery = new Map<string, TopicState>(
      masteryRows.map((m) => [
        m.topicId,
        { estimatedMastery: m.estimatedMastery, confidence: m.confidence },
      ]),
    );
    const pick = selectNextQuestion(candidatesRows as Candidate[], {
      answeredInSession: new Set(done.map((d) => d.questionId)),
      history,
      mastery,
      lastTopicId: done.at(-1)?.topicId,
      now: new Date(),
    });
    if (!pick) return { done: true as const, progress };

    const [question] = await tx
      .select({
        id: s.questions.id,
        stem: s.questions.stem,
        difficulty: s.questions.difficulty,
        isDemo: s.questions.isDemo,
        topicName: s.topics.name,
        disciplineName: s.disciplines.name,
      })
      .from(s.questions)
      .innerJoin(s.topics, eq(s.topics.id, s.questions.topicId))
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.questions.disciplineId))
      .where(eq(s.questions.id, pick.id));
    const options = await tx
      .select({
        id: s.questionOptions.id,
        body: s.questionOptions.body,
        displayOrder: s.questionOptions.displayOrder,
      })
      .from(s.questionOptions)
      .where(eq(s.questionOptions.questionId, pick.id))
      .orderBy(asc(s.questionOptions.displayOrder));
    return { done: false as const, progress, question: { ...question!, options } };
  });
}

/** Recalcula o domínio do assunto a partir das tentativas mais recentes. */
async function refreshMastery(tx: Tx, userId: string, topicId: string) {
  const rows = await tx
    .select({
      isCorrect: s.questionAttempts.isCorrect,
      answeredAt: s.questionAttempts.answeredAt,
      difficulty: s.questions.difficulty,
    })
    .from(s.questionAttempts)
    .innerJoin(s.questions, eq(s.questions.id, s.questionAttempts.questionId))
    .where(and(eq(s.questionAttempts.studentId, userId), eq(s.questions.topicId, topicId)))
    .orderBy(desc(s.questionAttempts.answeredAt))
    .limit(50);
  const m = estimateMastery(rows, new Date());
  const values = {
    attemptCount: m.attemptCount,
    correctCount: m.correctCount,
    estimatedMastery: m.estimatedMastery,
    confidence: m.confidence,
    lastAttemptAt: m.lastAttemptAt,
    algorithmVersion: MASTERY_ALGORITHM,
  };
  await tx
    .insert(s.topicMastery)
    .values({ studentId: userId, topicId, ...values })
    .onConflictDoUpdate({
      target: [s.topicMastery.studentId, s.topicMastery.topicId],
      set: values,
    });
  return m;
}

/**
 * Corrige e registra a tentativa. Idempotente pela clientAttemptKey: reenviar devolve o mesmo
 * resultado sem gravar de novo. A correção é feita pelo banco (trigger grade_attempt).
 */
export async function submitAttempt(userId: string, input: z.infer<typeof attemptInput>) {
  return withUser(db(), userId, async (tx) => {
    const session = await loadSession(tx, input.sessionId);
    let attempt = await tx.query.questionAttempts.findFirst({
      where: and(
        eq(s.questionAttempts.studentId, userId),
        eq(s.questionAttempts.clientAttemptKey, input.clientAttemptKey),
      ),
    });
    let replay = Boolean(attempt);
    if (!attempt) {
      if (session.finishedAt)
        throw new ApiError(409, 'session_finished', 'Esta sessão já terminou.');
      const already = await tx.query.questionAttempts.findFirst({
        where: and(
          eq(s.questionAttempts.sessionId, input.sessionId),
          eq(s.questionAttempts.questionId, input.questionId),
        ),
      });
      if (already) {
        attempt = already;
        replay = true;
      } else {
        try {
          const [row] = await tx
            .insert(s.questionAttempts)
            .values({
              sessionId: input.sessionId,
              questionId: input.questionId,
              studentId: userId,
              selectedOptionId: input.selectedOptionId,
              clientAttemptKey: input.clientAttemptKey,
              durationSeconds: input.durationSeconds,
            })
            .returning();
          attempt = row!;
        } catch (err) {
          const code = (err as { cause?: { code?: string } }).cause?.code;
          if (code === '23514')
            throw new ApiError(400, 'invalid_option', 'Essa alternativa não pertence à questão.');
          throw err;
        }
      }
    }
    if (attempt.questionId !== input.questionId)
      throw new ApiError(409, 'key_reused', 'Chave de tentativa já usada em outra questão.');

    const question = await tx.query.questions.findFirst({
      where: eq(s.questions.id, attempt.questionId),
    });
    if (!question) throw notFound('Questão');
    const [options, sources] = await Promise.all([
      tx
        .select()
        .from(s.questionOptions)
        .where(eq(s.questionOptions.questionId, question.id))
        .orderBy(asc(s.questionOptions.displayOrder)),
      tx.select().from(s.questionSources).where(eq(s.questionSources.questionId, question.id)),
    ]);
    const mastery = replay
      ? await tx.query.topicMastery.findFirst({
          where: and(
            eq(s.topicMastery.studentId, userId),
            eq(s.topicMastery.topicId, question.topicId),
          ),
        })
      : await refreshMastery(tx, userId, question.topicId);

    const answered = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.questionAttempts)
      .where(eq(s.questionAttempts.sessionId, session.id));
    const count = answered[0]?.n ?? 0;
    const finished = count >= session.targetCount;
    if (!replay) {
      await track(tx, userId, 'question_answered', {
        questionId: question.id,
        topicId: question.topicId,
        isCorrect: attempt.isCorrect,
        mode: session.mode,
        durationSeconds: input.durationSeconds ?? null,
      });
      if (finished && !session.finishedAt) {
        await tx
          .update(s.questionSessions)
          .set({ finishedAt: new Date() })
          .where(eq(s.questionSessions.id, session.id));
        await track(tx, userId, 'question_session_finished', {
          mode: session.mode,
          answered: count,
        });
      }
    }

    const correct = options.find((o) => o.isCorrect);
    return {
      attemptId: attempt.id,
      isCorrect: attempt.isCorrect,
      selectedOptionId: attempt.selectedOptionId,
      correctOptionId: correct?.id ?? null,
      explanation: correct?.explanation ?? '',
      options: options.map((o) => ({
        id: o.id,
        isCorrect: o.isCorrect,
        explanation: o.explanation,
      })),
      sourceRefs: sources.map((src) => ({ label: src.citation, url: src.url })),
      isDemo: question.isDemo,
      mastery: {
        topicId: question.topicId,
        status: masteryBand(mastery ?? null),
      },
      progress: { answered: count, total: session.targetCount, finished },
      nextActions: [
        finished ? 'finish' : 'next_question',
        ...(attempt.isCorrect ? [] : ['create_flashcard']),
        'review_topic',
      ],
      replay,
    };
  });
}

export async function sessionSummary(userId: string, sessionId: string) {
  return withUser(db(), userId, async (tx) => {
    const session = await loadSession(tx, sessionId);
    const rows = await tx
      .select({
        questionId: s.questions.id,
        stem: s.questions.stem,
        isCorrect: s.questionAttempts.isCorrect,
        topicId: s.topics.id,
        topicName: s.topics.name,
      })
      .from(s.questionAttempts)
      .innerJoin(s.questions, eq(s.questions.id, s.questionAttempts.questionId))
      .innerJoin(s.topics, eq(s.topics.id, s.questions.topicId))
      .where(eq(s.questionAttempts.sessionId, sessionId))
      .orderBy(asc(s.questionAttempts.answeredAt));
    const topicIds = [...new Set(rows.map((r) => r.topicId))];
    const mastery = topicIds.length
      ? await tx.select().from(s.topicMastery).where(inArray(s.topicMastery.topicId, topicIds))
      : [];
    return {
      session,
      attempts: rows,
      correct: rows.filter((r) => r.isCorrect).length,
      topics: topicIds.map((id) => ({
        topicId: id,
        topicName: rows.find((r) => r.topicId === id)!.topicName,
        band: masteryBand(mastery.find((m) => m.topicId === id) ?? null),
        correct: rows.filter((r) => r.topicId === id && r.isCorrect).length,
        total: rows.filter((r) => r.topicId === id).length,
      })),
    };
  });
}

export async function recentSessions(userId: string, limit = 10) {
  return withUser(db(), userId, (tx) =>
    tx
      .select({
        id: s.questionSessions.id,
        mode: s.questionSessions.mode,
        startedAt: s.questionSessions.startedAt,
        finishedAt: s.questionSessions.finishedAt,
        targetCount: s.questionSessions.targetCount,
        answered: sql<number>`(select count(*)::int from question_attempts a where a.session_id = ${s.questionSessions.id})`,
        correct: sql<number>`(select count(*)::int from question_attempts a where a.session_id = ${s.questionSessions.id} and a.is_correct)`,
      })
      .from(s.questionSessions)
      .orderBy(desc(s.questionSessions.startedAt))
      .limit(limit),
  );
}
