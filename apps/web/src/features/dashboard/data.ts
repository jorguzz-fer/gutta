import 'server-only';
import {
  addLocalDays,
  localDayKey,
  localDaysBetween,
  localWeekday,
  masteryBand,
  questionOfTheDay,
  recommendNext,
  type MasteryBand,
  type TopicInput,
} from '@gutta/core';
import { and, asc, desc, eq, gte, inArray, isNull, schema as s, sql, withUser } from '@gutta/db';
import { db } from '@/lib/db';
import { track } from '@/lib/events';
import { dueQueue } from '@/features/flashcards/service';

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

// Estimativas de tempo para o aluno decidir (Parkinson): ~1,5 min por questão, ~20 s por cartão.
const MIN_PER_QUESTION = 1.5;
const SEC_PER_CARD = 20;

export async function loadDashboard(userId: string) {
  const reviews = await dueQueue(userId, { limit: 200 });
  return withUser(db(), userId, async (tx) => {
    const person = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const tz = person?.timezone ?? 'America/Sao_Paulo';
    const now = new Date();
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
    });

    const active = await tx
      .select({ id: s.disciplines.id, name: s.disciplines.name, slug: s.disciplines.slug })
      .from(s.studentDisciplines)
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.studentDisciplines.disciplineId))
      .where(
        and(eq(s.studentDisciplines.studentId, userId), isNull(s.studentDisciplines.activeUntil)),
      )
      .orderBy(asc(s.disciplines.name));
    const disciplineIds = active.map((d) => d.id);

    const topics = disciplineIds.length
      ? await tx
          .select({
            id: s.topics.id,
            name: s.topics.name,
            disciplineId: s.topics.disciplineId,
            parentId: s.topics.parentId,
            // Nome qualificado de propósito: ${s.topics.id} sairia como "id" e casaria com q.id.
            questionCount: sql<number>`(select count(*)::int from questions q where q.topic_id = "topics"."id" and q.status = 'published')`,
          })
          .from(s.topics)
          .where(inArray(s.topics.disciplineId, disciplineIds))
          .orderBy(asc(s.topics.orderIndex))
      : [];
    const topicIds = topics.map((t) => t.id);
    const mastery = topicIds.length
      ? await tx.select().from(s.topicMastery).where(inArray(s.topicMastery.topicId, topicIds))
      : [];
    const exams = await tx
      .select({
        id: s.examDates.id,
        title: s.examDates.title,
        examAt: s.examDates.examAt,
        disciplineId: s.examDates.disciplineId,
        examDisciplineName: s.disciplines.name,
      })
      .from(s.examDates)
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.examDates.disciplineId))
      .where(gte(s.examDates.examAt, addLocalDays(now, 0, tz, 0)))
      .orderBy(asc(s.examDates.examAt));
    const nextExamDays = new Map<string, number>();
    for (const e of exams) {
      if (!nextExamDays.has(e.disciplineId))
        nextExamDays.set(e.disciplineId, localDaysBetween(now, e.examAt, tz));
    }

    const disciplineName = new Map(active.map((d) => [d.id, d.name]));
    const topicInputs: TopicInput[] = topics.map((t) => {
      const m = mastery.find((x) => x.topicId === t.id);
      return {
        topicId: t.id,
        topicName: t.name,
        disciplineId: t.disciplineId,
        disciplineName: disciplineName.get(t.disciplineId) ?? '',
        attemptCount: m?.attemptCount ?? 0,
        estimatedMastery: m?.estimatedMastery ?? null,
        confidence: m?.confidence ?? 'insufficient',
        questionCount: t.questionCount,
        examInDays: nextExamDays.get(t.disciplineId) ?? null,
      };
    });
    const recommendation = recommendNext({
      dueFlashcards: reviews.cards.length,
      topics: topicInputs,
    });

    // Registra a recomendação uma vez por dia e motivo (rastreabilidade sem inflar a tabela).
    const todayStart = addLocalDays(now, 0, tz, 0);
    const already = await tx
      .select({ id: s.learningRecommendations.id })
      .from(s.learningRecommendations)
      .where(
        and(
          gte(s.learningRecommendations.createdAt, todayStart),
          eq(s.learningRecommendations.reasonCode, recommendation.reasonCode),
          recommendation.topicId
            ? eq(s.learningRecommendations.topicId, recommendation.topicId)
            : isNull(s.learningRecommendations.topicId),
        ),
      )
      .limit(1);
    if (already.length === 0) {
      await tx.insert(s.learningRecommendations).values({
        studentId: userId,
        topicId: recommendation.topicId ?? null,
        type: recommendation.type,
        reasonCode: recommendation.reasonCode,
        payload: { title: recommendation.title, count: recommendation.count },
        algorithmVersion: recommendation.algorithmVersion,
      });
      await track(tx, userId, 'recommendation_shown', {
        reasonCode: recommendation.reasonCode,
        type: recommendation.type,
      });
    }

    // Questão do dia: estável no dia, entre as publicadas das disciplinas ativas.
    const published = topicIds.length
      ? await tx
          .select({ id: s.questions.id })
          .from(s.questions)
          .where(and(eq(s.questions.status, 'published'), inArray(s.questions.topicId, topicIds)))
      : [];
    const answeredRows = await tx
      .select({
        questionId: s.questionAttempts.questionId,
        answeredAt: s.questionAttempts.answeredAt,
      })
      .from(s.questionAttempts)
      .orderBy(desc(s.questionAttempts.answeredAt))
      .limit(1000);
    const todayKey = localDayKey(now, tz);
    // Para a escolha, só contam respostas de dias anteriores (a questão não troca depois de feita).
    const answeredBefore = new Set(
      answeredRows
        .filter((a) => localDayKey(a.answeredAt, tz) !== todayKey)
        .map((a) => a.questionId),
    );
    const qotdId = questionOfTheDay(
      published.map((p) => p.id),
      answeredBefore,
      todayKey,
      userId,
    );
    const qotd = qotdId
      ? await tx
          .select({
            id: s.questions.id,
            stem: s.questions.stem,
            topicName: s.topics.name,
            isDemo: s.questions.isDemo,
          })
          .from(s.questions)
          .innerJoin(s.topics, eq(s.topics.id, s.questions.topicId))
          .where(eq(s.questions.id, qotdId))
          .then((r) => r[0] ?? null)
      : null;
    const qotdDone = Boolean(
      qotdId &&
      answeredRows.some(
        (a) => a.questionId === qotdId && localDayKey(a.answeredAt, tz) === todayKey,
      ),
    );

    // Semana local (segunda a domingo): dias com estudo ativo, questões e revisões. Sem punição por falha.
    const daysSinceMonday = (localWeekday(now, tz) + 6) % 7;
    const weekStart = addLocalDays(now, -daysSinceMonday, tz, 0);
    const [weekAttempts, weekReviews] = await Promise.all([
      tx
        .select({ at: s.questionAttempts.answeredAt, ok: s.questionAttempts.isCorrect })
        .from(s.questionAttempts)
        .where(gte(s.questionAttempts.answeredAt, weekStart)),
      tx
        .select({ at: s.flashcardReviews.reviewedAt })
        .from(s.flashcardReviews)
        .where(gte(s.flashcardReviews.reviewedAt, weekStart)),
    ]);
    const activeDays = new Set([
      ...weekAttempts.map((a) => localDayKey(a.at, tz)),
      ...weekReviews.map((r) => localDayKey(r.at, tz)),
    ]);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = addLocalDays(weekStart, i, tz, 12);
      const key = localDayKey(day, tz);
      return {
        key,
        weekday: (i + 1) % 7,
        active: activeDays.has(key),
        isToday: key === todayKey,
        isFuture: key > todayKey,
      };
    });

    const gaps = active.map((d) => {
      const ts = topicInputs.filter((t) => t.disciplineId === d.id && t.questionCount > 0);
      return {
        ...d,
        topics: ts.map((t) => ({
          id: t.topicId,
          name: t.topicName,
          band: masteryBand(t) as MasteryBand,
        })),
      };
    });

    const totalAttempts = mastery.reduce((n, m) => n + m.attemptCount, 0);

    return {
      timezone: tz,
      firstName: (person?.displayName ?? '').split(' ')[0] ?? '',
      goalMinutes: profile?.studyGoalMinutes ?? 20,
      studyDays: profile?.studyDays ?? [1, 2, 3, 4, 5],
      recommendation,
      questionOfTheDay: qotd ? { ...qotd, done: qotdDone } : null,
      reviews: {
        due: reviews.dueCount,
        fresh: reviews.newCount,
        total: reviews.cards.length,
        minutes: Math.max(1, Math.round((reviews.cards.length * SEC_PER_CARD) / 60)),
      },
      recommendationMinutes:
        recommendation.type === 'review_flashcards'
          ? Math.max(1, Math.round((recommendation.count * SEC_PER_CARD) / 60))
          : Math.round(recommendation.count * MIN_PER_QUESTION),
      gaps,
      exams: exams.slice(0, 3).map((e) => ({
        ...e,
        disciplineName: e.examDisciplineName,
        inDays: localDaysBetween(now, e.examAt, tz),
      })),
      week: {
        days: weekDays,
        activeDays: activeDays.size,
        questions: weekAttempts.length,
        correct: weekAttempts.filter((a) => a.ok).length,
        reviews: weekReviews.length,
      },
      isNew: totalAttempts === 0,
    };
  });
}
