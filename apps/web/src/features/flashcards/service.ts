import 'server-only';
import {
  NEW_CARD,
  SRS_ALGORITHM,
  addLocalDays,
  endOfLocalDay,
  previewIntervals,
  schedule,
  type Rating,
  type SrsState,
} from '@gutta/core';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  schema as s,
  sql,
  withUser,
  type Tx,
  inSequence,
} from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { track } from '@/lib/events';

// Cartões editoriais novos que entram na fila por dia (padrão conservador para não afogar).
export const NEW_PER_DAY = 10;

export const reviewInput = z.object({
  rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  clientReviewKey: z.string().min(8).max(100),
});

export const createInput = z.union([
  z.object({ fromQuestionId: z.uuid() }),
  z.object({
    front: z.string().trim().min(2, 'Escreva a frente do cartão.').max(500),
    back: z.string().trim().min(1, 'Escreva o verso do cartão.').max(2000),
    topicId: z.uuid().optional(),
  }),
]);

async function timezoneOf(tx: Tx, userId: string) {
  const p = await tx.query.profiles.findFirst({
    where: eq(s.profiles.userId, userId),
    columns: { timezone: true },
  });
  return p?.timezone ?? 'America/Sao_Paulo';
}

async function activeTopicIds(tx: Tx, userId: string, moduleTopicId?: string) {
  if (moduleTopicId) {
    const t = await tx
      .select({ id: s.topics.id })
      .from(s.topics)
      .where(sql`${s.topics.id} = ${moduleTopicId} or ${s.topics.parentId} = ${moduleTopicId}`);
    return t.map((r) => r.id);
  }
  const rows = await tx
    .select({ id: s.topics.id })
    .from(s.topics)
    .innerJoin(s.studentDisciplines, eq(s.studentDisciplines.disciplineId, s.topics.disciplineId))
    .where(
      and(eq(s.studentDisciplines.studentId, userId), isNull(s.studentDisciplines.activeUntil)),
    );
  return rows.map((r) => r.id);
}

type CardOut = {
  id: string;
  front: string;
  back: string;
  isDemo: boolean;
  personal: boolean;
  topicName: string | null;
  isNew: boolean;
  preview: Record<Rating, string>;
};

/** Fila de hoje: vencidos até o fim do dia local + alguns editoriais novos das disciplinas ativas. */
export async function dueQueue(userId: string, opts: { limit?: number; moduleId?: string } = {}) {
  return withUser(db(), userId, async (tx) => {
    const tz = await timezoneOf(tx, userId);
    const now = new Date();
    const end = endOfLocalDay(now, tz);
    const limit = opts.limit ?? 50;
    let moduleTopicId: string | undefined;
    if (opts.moduleId) {
      const m = await tx.query.modules.findFirst({ where: eq(s.modules.id, opts.moduleId) });
      if (!m) throw notFound('Módulo');
      moduleTopicId = m.topicId;
    }
    const topicIds = await activeTopicIds(tx, userId, moduleTopicId);

    const due = await tx
      .select({
        card: s.flashcards,
        sched: s.flashcardSchedules,
        topicName: s.topics.name,
      })
      .from(s.flashcardSchedules)
      .innerJoin(s.flashcards, eq(s.flashcards.id, s.flashcardSchedules.flashcardId))
      .leftJoin(s.topics, eq(s.topics.id, s.flashcards.topicId))
      .where(
        and(
          eq(s.flashcardSchedules.studentId, userId),
          lt(s.flashcardSchedules.dueAt, end),
          moduleTopicId && topicIds.length ? inArray(s.flashcards.topicId, topicIds) : undefined,
        ),
      )
      .orderBy(asc(s.flashcardSchedules.dueAt))
      .limit(limit);

    // Quantos cartões novos o aluno já começou hoje.
    const startOfDay = addLocalDays(now, 0, tz, 0);
    const startedToday = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.flashcardSchedules)
      .where(
        and(
          eq(s.flashcardSchedules.studentId, userId),
          gte(s.flashcardSchedules.createdAt, startOfDay),
        ),
      );
    const newBudget = Math.max(0, NEW_PER_DAY - (startedToday[0]?.n ?? 0));
    const fresh =
      newBudget > 0 && topicIds.length
        ? await tx
            .select({ card: s.flashcards, topicName: s.topics.name })
            .from(s.flashcards)
            .leftJoin(s.topics, eq(s.topics.id, s.flashcards.topicId))
            .where(
              and(
                isNull(s.flashcards.ownerId),
                eq(s.flashcards.status, 'published'),
                inArray(s.flashcards.topicId, topicIds),
                sql`not exists (select 1 from flashcard_schedules fs where fs.flashcard_id = "flashcards"."id" and fs.student_id = ${userId})`,
              ),
            )
            .orderBy(asc(s.flashcards.createdAt))
            .limit(Math.min(newBudget, Math.max(0, limit - due.length)))
        : [];

    const cards: CardOut[] = [
      ...due.map((d) => ({
        id: d.card.id,
        front: d.card.front,
        back: d.card.back,
        isDemo: d.card.isDemo,
        personal: d.card.ownerId !== null,
        topicName: d.topicName,
        isNew: false,
        preview: previewIntervals(toState(d.sched), now, tz),
      })),
      ...fresh.map((f) => ({
        id: f.card.id,
        front: f.card.front,
        back: f.card.back,
        isDemo: f.card.isDemo,
        personal: false,
        topicName: f.topicName,
        isNew: true,
        preview: previewIntervals(NEW_CARD, now, tz),
      })),
    ];
    return { cards, dueCount: due.length, newCount: fresh.length, timezone: tz };
  });
}

function toState(row: {
  repetitions: number;
  intervalDays: number;
  ease: number;
  lapses: number;
}): SrsState {
  return {
    repetitions: row.repetitions,
    intervalDays: row.intervalDays,
    ease: row.ease,
    lapses: row.lapses,
  };
}

/** Registra a revisão e reprograma. Idempotente pela clientReviewKey. */
export async function reviewCard(
  userId: string,
  flashcardId: string,
  input: z.infer<typeof reviewInput>,
) {
  return withUser(db(), userId, async (tx) => {
    const replay = await tx.query.flashcardReviews.findFirst({
      where: and(
        eq(s.flashcardReviews.studentId, userId),
        eq(s.flashcardReviews.clientReviewKey, input.clientReviewKey),
      ),
    });
    if (replay) {
      return { flashcardId, nextDueAt: replay.nextDueAt, intervalDays: null, replay: true };
    }
    const card = await tx.query.flashcards.findFirst({ where: eq(s.flashcards.id, flashcardId) });
    if (!card) throw notFound('Flashcard');
    if (card.ownerId === null && card.status !== 'published')
      throw new ApiError(409, 'not_published', 'Cartão indisponível.');
    const tz = await timezoneOf(tx, userId);
    const now = new Date();
    const current = await tx.query.flashcardSchedules.findFirst({
      where: and(
        eq(s.flashcardSchedules.studentId, userId),
        eq(s.flashcardSchedules.flashcardId, flashcardId),
      ),
    });
    const prev = current ? toState(current) : NEW_CARD;
    const next = schedule(prev, input.rating as Rating, now, tz);
    const values = {
      dueAt: next.dueAt,
      intervalDays: next.intervalDays,
      ease: next.ease,
      repetitions: next.repetitions,
      lapses: next.lapses,
      algorithmVersion: SRS_ALGORITHM,
      lastReviewedAt: now,
    };
    await tx
      .insert(s.flashcardSchedules)
      .values({ studentId: userId, flashcardId, ...values })
      .onConflictDoUpdate({
        target: [s.flashcardSchedules.studentId, s.flashcardSchedules.flashcardId],
        set: values,
      });
    await tx.insert(s.flashcardReviews).values({
      studentId: userId,
      flashcardId,
      rating: input.rating,
      prevIntervalDays: prev.intervalDays,
      nextDueAt: next.dueAt,
      clientReviewKey: input.clientReviewKey,
    });
    await track(tx, userId, 'flashcard_reviewed', {
      rating: input.rating,
      isNew: !current,
      personal: card.ownerId !== null,
    });
    return { flashcardId, nextDueAt: next.dueAt, intervalDays: next.intervalDays, replay: false };
  });
}

/** Cria cartão pessoal, a partir de questão errada ou escrito pelo aluno. Primeira revisão amanhã. */
export async function createFlashcard(userId: string, input: z.infer<typeof createInput>) {
  return withUser(db(), userId, async (tx) => {
    let values: {
      front: string;
      back: string;
      topicId: string | null;
      sourceQuestionId: string | null;
    };
    if ('fromQuestionId' in input) {
      const q = await tx.query.questions.findFirst({
        where: and(eq(s.questions.id, input.fromQuestionId), eq(s.questions.status, 'published')),
      });
      if (!q) throw notFound('Questão');
      // Só depois de responder a questão o aluno pode transformar o gabarito em cartão.
      const answered = await tx.query.questionAttempts.findFirst({
        where: and(
          eq(s.questionAttempts.studentId, userId),
          eq(s.questionAttempts.questionId, q.id),
        ),
      });
      if (!answered)
        throw new ApiError(409, 'answer_first', 'Responda a questão antes de criar o cartão.');
      const correct = await tx.query.questionOptions.findFirst({
        where: and(eq(s.questionOptions.questionId, q.id), eq(s.questionOptions.isCorrect, true)),
      });
      values = {
        front: q.stem,
        back: [correct?.body, correct?.explanation].filter(Boolean).join('\n\n'),
        topicId: q.topicId,
        sourceQuestionId: q.id,
      };
    } else {
      if (input.topicId) {
        const t = await tx.query.topics.findFirst({ where: eq(s.topics.id, input.topicId) });
        if (!t) throw notFound('Assunto');
      }
      values = {
        front: input.front,
        back: input.back,
        topicId: input.topicId ?? null,
        sourceQuestionId: null,
      };
    }
    const [card] = await tx
      .insert(s.flashcards)
      .values({
        ...values,
        ownerId: userId,
        visibility: 'private',
        status: 'published',
        authorId: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!card) return { created: false };
    const tz = await timezoneOf(tx, userId);
    await tx.insert(s.flashcardSchedules).values({
      studentId: userId,
      flashcardId: card.id,
      dueAt: addLocalDays(new Date(), 1, tz),
      algorithmVersion: SRS_ALGORITHM,
    });
    await track(tx, userId, 'flashcard_created', {
      fromQuestion: Boolean(values.sourceQuestionId),
    });
    return { created: true, flashcardId: card.id };
  });
}

export async function listPersonal(userId: string) {
  return withUser(db(), userId, (tx) =>
    tx
      .select({
        id: s.flashcards.id,
        front: s.flashcards.front,
        back: s.flashcards.back,
        createdAt: s.flashcards.createdAt,
        dueAt: s.flashcardSchedules.dueAt,
        fromQuestion: sql<boolean>`${s.flashcards.sourceQuestionId} is not null`,
      })
      .from(s.flashcards)
      .leftJoin(
        s.flashcardSchedules,
        and(
          eq(s.flashcardSchedules.flashcardId, s.flashcards.id),
          eq(s.flashcardSchedules.studentId, userId),
        ),
      )
      .where(eq(s.flashcards.ownerId, userId))
      .orderBy(desc(s.flashcards.createdAt)),
  );
}

export async function deletePersonal(userId: string, id: string) {
  const rows = await withUser(db(), userId, (tx) =>
    tx
      .delete(s.flashcards)
      .where(and(eq(s.flashcards.id, id), eq(s.flashcards.ownerId, userId)))
      .returning({ id: s.flashcards.id }),
  );
  if (rows.length === 0) throw notFound('Flashcard');
  return { deleted: true };
}

/** Para o painel: quantos vencem hoje (incluindo novos disponíveis) e quantos amanhã. */
export async function dueSummary(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const tz = await timezoneOf(tx, userId);
    const now = new Date();
    const end = endOfLocalDay(now, tz);
    const endTomorrow = endOfLocalDay(new Date(end.getTime() + 3600_000), tz);
    const [today, tomorrow] = await inSequence([
      () =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(s.flashcardSchedules)
          .where(
            and(eq(s.flashcardSchedules.studentId, userId), lt(s.flashcardSchedules.dueAt, end)),
          ),
      () =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(s.flashcardSchedules)
          .where(
            and(
              eq(s.flashcardSchedules.studentId, userId),
              gte(s.flashcardSchedules.dueAt, end),
              lt(s.flashcardSchedules.dueAt, endTomorrow),
            ),
          ),
    ]);
    return { dueToday: today[0]?.n ?? 0, dueTomorrow: tomorrow[0]?.n ?? 0 };
  });
}
