import 'server-only';
import { localDayKey } from '@gutta/core';
import { gte, schema as s, sql, withUser } from '@gutta/db';
import { db } from '@/lib/db';

const TZ = 'America/Sao_Paulo';
// Eventos que contam como estudo ativo (SPEC §1.4): login e navegação não entram.
const ACTIVE_EVENTS = ['question_answered', 'flashcard_reviewed', 'question_session_finished'];

/**
 * Métricas do piloto para admin (ANA-01). Tudo vem do banco, com contagens reais; amostras
 * pequenas são sinalizadas em vez de virar porcentagem enganosa.
 */
export async function loadMetrics(adminId: string) {
  return withUser(db(), adminId, async (tx) => {
    const now = new Date();
    const since14 = new Date(now.getTime() - 14 * 86_400_000);
    const since7 = new Date(now.getTime() - 7 * 86_400_000);

    const activeEvents = await tx
      .select({ actorId: s.productEvents.actorId, at: s.productEvents.createdAt })
      .from(s.productEvents)
      .where(
        sql`${s.productEvents.eventName} in ('question_answered','flashcard_reviewed','question_session_finished') and ${s.productEvents.createdAt} >= ${since14}`,
      );
    const wals = new Set(activeEvents.filter((e) => e.at >= since7).map((e) => e.actorId)).size;

    const days = Array.from({ length: 14 }, (_, i) =>
      localDayKey(new Date(now.getTime() - (13 - i) * 86_400_000), TZ),
    );
    const daily = days.map((day) => ({
      day,
      active: new Set(
        activeEvents.filter((e) => localDayKey(e.at, TZ) === day).map((e) => e.actorId),
      ).size,
    }));

    const counts = await tx
      .select({
        name: s.productEvents.eventName,
        n: sql<number>`count(*)::int`,
        actors: sql<number>`count(distinct ${s.productEvents.actorId})::int`,
      })
      .from(s.productEvents)
      .where(gte(s.productEvents.createdAt, since7))
      .groupBy(s.productEvents.eventName);
    const ev = (name: string) => counts.find((c) => c.name === name) ?? { n: 0, actors: 0 };

    const allTime = await tx
      .select({
        name: s.productEvents.eventName,
        actors: sql<number>`count(distinct ${s.productEvents.actorId})::int`,
      })
      .from(s.productEvents)
      .where(sql`${s.productEvents.eventName} in ('account_created','onboarding_completed')`)
      .groupBy(s.productEvents.eventName);
    const signups = allTime.find((a) => a.name === 'account_created')?.actors ?? 0;
    const onboarded = allTime.find((a) => a.name === 'onboarding_completed')?.actors ?? 0;

    // Retenção: entre quem criou conta há pelo menos N dias, quantos tiveram estudo ativo no dia N.
    const retention = await tx.execute<{
      d1_base: number;
      d1: number;
      d7_base: number;
      d7: number;
    }>(sql`
      with cohort as (
        select actor_id, min(created_at) as joined from product_events
        where event_name = 'account_created' and actor_id is not null group by actor_id
      ), active as (
        select actor_id, created_at from product_events
        where event_name in ('question_answered','flashcard_reviewed','question_session_finished')
      )
      select
        count(*) filter (where c.joined <= now() - interval '1 day')::int as d1_base,
        count(*) filter (where c.joined <= now() - interval '1 day' and exists (
          select 1 from active a where a.actor_id = c.actor_id
            and a.created_at >= c.joined + interval '1 day' and a.created_at < c.joined + interval '2 days'))::int as d1,
        count(*) filter (where c.joined <= now() - interval '7 days')::int as d7_base,
        count(*) filter (where c.joined <= now() - interval '7 days' and exists (
          select 1 from active a where a.actor_id = c.actor_id
            and a.created_at >= c.joined + interval '7 days' and a.created_at < c.joined + interval '8 days'))::int as d7
      from cohort c`);
    const r = retention.rows[0] ?? { d1_base: 0, d1: 0, d7_base: 0, d7: 0 };

    const accuracy = await tx
      .select({
        total: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${s.questionAttempts.isCorrect})::int`,
      })
      .from(s.questionAttempts)
      .where(gte(s.questionAttempts.answeredAt, since7));

    const hardest = await tx.execute<{
      id: string;
      stem: string;
      attempts: number;
      correct: number;
    }>(sql`
      select q.id, q.stem, count(*)::int as attempts, count(*) filter (where a.is_correct)::int as correct
      from question_attempts a join questions q on q.id = a.question_id
      group by q.id, q.stem having count(*) >= 5
      order by (count(*) filter (where a.is_correct))::float / count(*) asc limit 5`);

    const reasons = await tx
      .select({ reason: s.learningRecommendations.reasonCode, n: sql<number>`count(*)::int` })
      .from(s.learningRecommendations)
      .where(gte(s.learningRecommendations.createdAt, since7))
      .groupBy(s.learningRecommendations.reasonCode);

    const answered = ev('question_answered');
    return {
      wals,
      daily,
      signups,
      onboarded,
      retention: r,
      week: {
        questions: answered.n,
        questionsPerActive: answered.actors ? Math.round(answered.n / answered.actors) : 0,
        reviews: ev('flashcard_reviewed').n,
        flashcardsCreated: ev('flashcard_created').n,
        sessionsFinished: ev('question_session_finished').n,
        accuracy: accuracy[0] ?? { total: 0, correct: 0 },
      },
      hardest: hardest.rows,
      reasons,
      activeEvents: ACTIVE_EVENTS,
    };
  });
}
