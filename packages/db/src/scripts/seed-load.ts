import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createDb, createPool } from '../client';
import { hashPassword } from '../password';
import * as s from '../schema';
import { runMigrations } from './migrate';
import { dbNameOf, ensureRolesAndDatabase, passwordOf } from './roles';
import { runSeed } from './seed';

/*
  Massa de dados para o teste de carga (loadtest/). Banco próprio (gutta_load), nunca produção.
  Volume pensado como "fim de semestre do piloto, com folga": 300 alunos, ~400 questões
  publicadas, ~40 tentativas e 10 cartões agendados por aluno, eventos de produto.
  Tudo marcado como demonstração; senha única só para o k6.
*/
const USERS = Number(process.env.LOAD_USERS ?? 300);
const EXTRA_QUESTIONS = Number(process.env.LOAD_QUESTIONS ?? 400);
const ATTEMPTS_PER_USER = Number(process.env.LOAD_ATTEMPTS ?? 40);
export const LOAD_PASSWORD = 'carga-senha-2026';

async function main() {
  const superuserUrl =
    process.env.PG_SUPERUSER_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
  const ownerUrl =
    process.env.LOAD_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_load';
  const appUrl =
    process.env.LOAD_DATABASE_URL ?? 'postgres://gutta_app:gutta_app_dev@localhost:5432/gutta_load';
  await ensureRolesAndDatabase({
    superuserUrl,
    dbName: dbNameOf(ownerUrl),
    ownerPassword: passwordOf(ownerUrl),
    appPassword: passwordOf(appUrl),
  });
  await runMigrations(ownerUrl);
  const base = await runSeed(ownerUrl);

  const pool = createPool(ownerUrl, 4);
  const db = createDb(pool);
  try {
    const already = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.authUsers)
      .where(sql`email like 'carga-%'`);
    if ((already[0]?.n ?? 0) >= USERS) {
      console.log(`massa já existe (${already[0]!.n} usuários de carga)`);
      return;
    }

    // Questões extras, espalhadas pelos assuntos, para o banco não ficar irrealmente pequeno.
    const topics = await db.select().from(s.topics);
    const editor = base.users['editor@gutta.test']!;
    for (let start = 0; start < EXTRA_QUESTIONS; start += 100) {
      const rows = Array.from({ length: Math.min(100, EXTRA_QUESTIONS - start) }, (_, k) => {
        const i = start + k;
        const t = topics[i % topics.length]!;
        return {
          topicId: t.id,
          disciplineId: t.disciplineId,
          stem: `[carga] Questão sintética ${i + 1} sobre ${t.name}: qual alternativa está correta?`,
          difficulty: (i % 5) + 1,
          status: 'published' as const,
          isDemo: true,
          authorId: editor,
          reviewerId: editor,
          publishedAt: new Date(),
        };
      });
      const inserted = await db.insert(s.questions).values(rows).returning({ id: s.questions.id });
      await db.insert(s.questionOptions).values(
        inserted.flatMap((q) =>
          [0, 1, 2, 3].map((o) => ({
            questionId: q.id,
            displayOrder: o,
            body: `Alternativa ${'ABCD'[o]}`,
            explanation: o === 0 ? 'Correta (sintética).' : 'Incorreta (sintética).',
            isCorrect: o === 0,
          })),
        ),
      );
    }

    const published = await db
      .select({ id: s.questions.id, topicId: s.questions.topicId })
      .from(s.questions)
      .where(eq(s.questions.status, 'published'));
    const options = await db
      .select({ id: s.questionOptions.id, questionId: s.questionOptions.questionId })
      .from(s.questionOptions);
    const optsByQ = new Map<string, string[]>();
    for (const o of options)
      optsByQ.set(o.questionId, [...(optsByQ.get(o.questionId) ?? []), o.id]);
    const editorialCards = await db
      .select({ id: s.flashcards.id })
      .from(s.flashcards)
      .where(eq(s.flashcards.visibility, 'editorial'));
    const disciplines = Object.values(base.disciplines);
    const hash = await hashPassword(LOAD_PASSWORD);
    const now = Date.now();

    for (let u = 0; u < USERS; u++) {
      const id = randomUUID();
      const email = `carga-${String(u + 1).padStart(3, '0')}@gutta.test`;
      await db
        .insert(s.authUsers)
        .values({ id, email, name: `Carga ${u + 1}`, emailVerified: true });
      await db.insert(s.authAccounts).values({
        id: randomUUID(),
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: hash,
      });
      await db.insert(s.profiles).values({ userId: id, displayName: `Carga ${u + 1}` });
      await db.insert(s.studentProfiles).values({
        userId: id,
        courseId: base.courseId,
        semester: 3,
        onboardingCompletedAt: new Date(),
      });
      await db
        .insert(s.studentDisciplines)
        .values(disciplines.map((d) => ({ studentId: id, disciplineId: d })));
      await db
        .insert(s.consentRecords)
        .values({ userId: id, purpose: 'terms', granted: true, policyVersion: 'carga' });

      const sessions = Math.ceil(ATTEMPTS_PER_USER / 10);
      const attempts: (typeof s.questionAttempts.$inferInsert)[] = [];
      const events: (typeof s.productEvents.$inferInsert)[] = [
        {
          actorId: id,
          eventName: 'account_created',
          properties: {},
          createdAt: new Date(now - 30 * 86_400_000),
        },
      ];
      for (let k = 0; k < sessions; k++) {
        const startedAt = new Date(now - (k * 3 + (u % 5)) * 86_400_000);
        const [sess] = await db
          .insert(s.questionSessions)
          .values({
            studentId: id,
            algorithmVersion: 'carga',
            targetCount: 10,
            startedAt,
            finishedAt: startedAt,
          })
          .returning({ id: s.questionSessions.id });
        for (let a = 0; a < 10; a++) {
          const q = published[(u * 37 + k * 10 + a) % published.length]!;
          const opts = optsByQ.get(q.id)!;
          attempts.push({
            sessionId: sess!.id,
            questionId: q.id,
            studentId: id,
            selectedOptionId: opts[(u + a) % opts.length]!,
            clientAttemptKey: randomUUID(),
            answeredAt: new Date(startedAt.getTime() + a * 60_000),
            durationSeconds: 40 + ((u + a) % 60),
          });
          events.push({
            actorId: id,
            eventName: 'question_answered',
            properties: { topicId: q.topicId },
            createdAt: startedAt,
          });
        }
      }
      await db.insert(s.questionAttempts).values(attempts);
      await db.insert(s.productEvents).values(events);
      await db.insert(s.flashcardSchedules).values(
        editorialCards.map((c, i) => ({
          studentId: id,
          flashcardId: c.id,
          dueAt: new Date(now + ((i % 4) - 2) * 86_400_000),
          intervalDays: 1 + (i % 6),
          repetitions: 1 + (i % 3),
          algorithmVersion: 'carga',
        })),
      );
      if ((u + 1) % 50 === 0) console.log(`${u + 1}/${USERS} usuários`);
    }

    // Domínio por assunto calculado em SQL (mesma ideia do V1, sem recência), para o painel ter dados.
    await db.execute(sql`
      insert into topic_mastery (student_id, topic_id, attempt_count, correct_count, estimated_mastery, confidence, last_attempt_at, algorithm_version)
      select a.student_id, q.topic_id, count(*), count(*) filter (where a.is_correct),
             (count(*) filter (where a.is_correct) + 1)::real / (count(*) + 2),
             (case when count(*) < 3 then 'insufficient' when count(*) < 6 then 'low' when count(*) < 12 then 'medium' else 'high' end)::mastery_confidence,
             max(a.answered_at), 'carga'
      from question_attempts a join questions q on q.id = a.question_id
      join auth_users u on u.id = a.student_id and u.email like 'carga-%'
      group by a.student_id, q.topic_id
      on conflict do nothing`);
    await db.execute(sql`analyze`);
    const totals = await db.execute<{ t: string; n: number }>(sql`
      select 'tentativas' t, count(*)::int n from question_attempts union all
      select 'questões publicadas', count(*)::int from questions where status = 'published' union all
      select 'eventos', count(*)::int from product_events union all
      select 'agendamentos', count(*)::int from flashcard_schedules`);
    console.table(totals.rows);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
