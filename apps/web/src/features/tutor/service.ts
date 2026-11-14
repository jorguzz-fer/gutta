import 'server-only';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { audit, track } from '@/lib/events';
import { latestConsent } from '@/features/privacy/consent';
import { costMicros } from './pricing';
import {
  answeredBlock,
  HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  moduleMaterial,
  TUTOR_RULES,
  type TutorContext,
} from './prompt';
import { aiProvider, ProviderUnavailable } from './provider';

/*
  Tutor IA (SPEC M3). Fluxo de uma pergunta: confere se o tutor está ligado e a cota do aluno,
  monta o contexto só com conteúdo publicado do módulo e com as questões que o aluno já
  respondeu, chama o provedor, e grava pergunta e resposta com tokens e custo.
*/

export type TutorSettings = { enabled: boolean; dailyLimit: number };

export async function readSettings(tx: Tx): Promise<TutorSettings> {
  const row = await tx.query.appSettings.findFirst({ where: eq(s.appSettings.key, 'tutor') });
  const v = (row?.value ?? {}) as Partial<TutorSettings>;
  return {
    enabled: v.enabled ?? true,
    dailyLimit: typeof v.dailyLimit === 'number' ? v.dailyLimit : env().TUTOR_DAILY_LIMIT,
  };
}

export const askInput = z.object({
  moduleId: z.uuid(),
  message: z
    .string()
    .trim()
    .min(3, 'Escreva sua dúvida.')
    .max(MAX_QUESTION_CHARS, `Use até ${MAX_QUESTION_CHARS} caracteres.`),
});

async function usedLast24h(tx: Tx, studentId: string) {
  const r = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.tutorMessages)
    .where(
      and(
        eq(s.tutorMessages.studentId, studentId),
        eq(s.tutorMessages.role, 'user'),
        gte(s.tutorMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return r[0]?.n ?? 0;
}

async function context(tx: Tx, studentId: string, moduleId: string) {
  const mod = await tx.query.modules.findFirst({
    where: and(eq(s.modules.id, moduleId), eq(s.modules.status, 'published')),
  });
  if (!mod) throw notFound('Módulo');
  const discipline = await tx.query.disciplines.findFirst({
    where: eq(s.disciplines.id, mod.disciplineId),
  });
  const topicRows = await tx
    .select({ id: s.topics.id })
    .from(s.topics)
    .where(or(eq(s.topics.id, mod.topicId), eq(s.topics.parentId, mod.topicId)));
  const topicIds = topicRows.map((t) => t.id);
  // Só questões que ESTE aluno já respondeu: a explicação da correta não vaza antes da tentativa.
  const answered = topicIds.length
    ? await tx
        .selectDistinctOn([s.questions.id], {
          id: s.questions.id,
          stem: s.questions.stem,
          gotRight: s.questionAttempts.isCorrect,
          correct: s.questionOptions.body,
          explanation: s.questionOptions.explanation,
        })
        .from(s.questionAttempts)
        .innerJoin(s.questions, eq(s.questions.id, s.questionAttempts.questionId))
        .innerJoin(
          s.questionOptions,
          and(
            eq(s.questionOptions.questionId, s.questions.id),
            eq(s.questionOptions.isCorrect, true),
          ),
        )
        .where(
          and(
            eq(s.questionAttempts.studentId, studentId),
            inArray(s.questions.topicId, topicIds),
            eq(s.questions.status, 'published'),
          ),
        )
        .orderBy(s.questions.id, desc(s.questionAttempts.answeredAt))
        .limit(15)
    : [];
  const ctx: TutorContext = {
    moduleTitle: mod.title,
    disciplineName: discipline?.name ?? '',
    isDemo: mod.isDemo,
    summaryMd: mod.summaryMd,
    lead: mod.lead,
    answered: answered.map((a) => ({
      stem: a.stem,
      correct: a.correct,
      explanation: a.explanation ?? '',
      gotRight: a.gotRight,
    })),
  };
  return { mod, ctx };
}

/** Contexto que vai ao modelo (exposto para os testes de vazamento de gabarito). */
export async function loadTutorContext(student: CurrentUser, moduleId: string) {
  return withUser(db(), student.id, async (tx) => (await context(tx, student.id, moduleId)).ctx);
}

export async function getTutorState(student: CurrentUser, moduleId: string) {
  return withUser(db(), student.id, async (tx) => {
    const settings = await readSettings(tx);
    const conv = await tx.query.tutorConversations.findFirst({
      where: and(
        eq(s.tutorConversations.studentId, student.id),
        eq(s.tutorConversations.moduleId, moduleId),
      ),
      orderBy: desc(s.tutorConversations.createdAt),
    });
    const messages = conv
      ? await tx
          .select({
            id: s.tutorMessages.id,
            role: s.tutorMessages.role,
            content: s.tutorMessages.content,
          })
          .from(s.tutorMessages)
          .where(
            and(
              eq(s.tutorMessages.conversationId, conv.id),
              eq(s.tutorMessages.studentId, student.id),
              isNull(s.tutorMessages.redactedAt),
            ),
          )
          .orderBy(asc(s.tutorMessages.createdAt))
          .limit(60)
      : [];
    const used = await usedLast24h(tx, student.id);
    const consent = await latestConsent(tx, student.id, 'ai_tutor');
    return {
      consented: consent?.granted === true,
      available: settings.enabled && aiProvider().available(),
      remaining: Math.max(0, settings.dailyLimit - used),
      dailyLimit: settings.dailyLimit,
      messages,
    };
  });
}

export async function askTutor(student: CurrentUser, raw: unknown) {
  const { moduleId, message } = askInput.parse(raw);
  const provider = aiProvider();

  // 1) Pré-condições e gravação da pergunta, numa transação curta.
  const prep = await withUser(db(), student.id, async (tx) => {
    const settings = await readSettings(tx);
    if (!settings.enabled || !provider.available())
      throw new ApiError(503, 'tutor_off', 'O tutor está desligado no momento.');
    // A pergunta e o desempenho no módulo vão para um operador fora do Brasil (LGPD art. 33):
    // só com consentimento específico, que o aluno retira em Privacidade.
    if ((await latestConsent(tx, student.id, 'ai_tutor'))?.granted !== true)
      throw new ApiError(
        403,
        'consent_required',
        'Para usar o tutor, aceite antes o uso descrito acima.',
      );
    if ((await usedLast24h(tx, student.id)) >= settings.dailyLimit)
      throw new ApiError(
        429,
        'quota',
        `Você usou as ${settings.dailyLimit} perguntas das últimas 24 horas. O tutor volta a responder amanhã.`,
      );
    const { ctx } = await context(tx, student.id, moduleId);
    let conv = await tx.query.tutorConversations.findFirst({
      where: and(
        eq(s.tutorConversations.studentId, student.id),
        eq(s.tutorConversations.moduleId, moduleId),
      ),
      orderBy: desc(s.tutorConversations.createdAt),
    });
    if (!conv) {
      [conv] = await tx
        .insert(s.tutorConversations)
        .values({ studentId: student.id, moduleId })
        .returning();
    }
    const history = await tx
      .select({ role: s.tutorMessages.role, content: s.tutorMessages.content })
      .from(s.tutorMessages)
      .where(
        and(
          eq(s.tutorMessages.conversationId, conv!.id),
          eq(s.tutorMessages.studentId, student.id),
          isNull(s.tutorMessages.redactedAt),
        ),
      )
      .orderBy(desc(s.tutorMessages.createdAt))
      .limit(HISTORY_TURNS * 2);
    await tx.insert(s.tutorMessages).values({
      conversationId: conv!.id,
      studentId: student.id,
      role: 'user',
      content: message,
    });
    await track(tx, student.id, 'tutor_asked', { moduleId });
    return { ctx, conversationId: conv!.id, history: history.reverse() };
  });

  // 2) Chamada ao modelo fora da transação (não segura conexão do banco por segundos).
  // O histórico precisa começar pelo aluno e alternar papéis.
  const turns = [...prep.history, { role: 'user' as const, content: message }];
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  let reply;
  try {
    reply = await provider.reply({
      rules: TUTOR_RULES,
      material: moduleMaterial(prep.ctx),
      answered: answeredBlock(prep.ctx),
      messages: turns,
    });
  } catch (err) {
    if (err instanceof ProviderUnavailable)
      throw new ApiError(503, 'tutor_unavailable', err.message);
    throw err;
  }

  // 3) Resposta gravada com uso e custo.
  await withUser(db(), student.id, (tx) =>
    tx.insert(s.tutorMessages).values({
      conversationId: prep.conversationId,
      studentId: student.id,
      role: 'assistant',
      content: reply.text,
      model: reply.model,
      inputTokens: reply.usage.input,
      outputTokens: reply.usage.output,
      cacheReadTokens: reply.usage.cacheRead,
      cacheWriteTokens: reply.usage.cacheWrite,
      costMicros: costMicros(reply.model, reply.usage),
      stopReason: reply.stopReason,
      refused: reply.refused,
    }),
  );
  return reply.text;
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function tutorAdminOverview(admin: CurrentUser) {
  return withUser(db(), admin.id, async (tx) => {
    const settings = await readSettings(tx);
    const window = async (days: number) =>
      (
        await tx.execute<{
          questions: number;
          students: number;
          cost: number;
          input: number;
          output: number;
          cache_read: number;
          refused: number;
        }>(sql`
          select count(*) filter (where role = 'user')::int as questions,
                 count(distinct student_id)::int as students,
                 coalesce(sum(cost_micros), 0)::bigint::int as cost,
                 coalesce(sum(input_tokens), 0)::int as input,
                 coalesce(sum(output_tokens), 0)::int as output,
                 coalesce(sum(cache_read_tokens), 0)::int as cache_read,
                 (count(*) filter (where refused))::int as refused
          from tutor_messages where created_at > now() - make_interval(days => ${days})`)
      ).rows[0]!;
    const [day, week, month] = [await window(1), await window(7), await window(30)];
    const recent = await tx
      .select({
        id: s.tutorConversations.id,
        createdAt: s.tutorConversations.createdAt,
        studentName: s.profiles.displayName,
        moduleTitle: s.modules.title,
        messages: sql<number>`(select count(*)::int from tutor_messages m where m.conversation_id = "tutor_conversations"."id")`,
        lastAt: sql<Date>`(select max(m.created_at) from tutor_messages m where m.conversation_id = "tutor_conversations"."id")`,
      })
      .from(s.tutorConversations)
      .innerJoin(s.modules, eq(s.modules.id, s.tutorConversations.moduleId))
      .leftJoin(s.profiles, eq(s.profiles.userId, s.tutorConversations.studentId))
      .orderBy(
        desc(
          sql`(select max(m.created_at) from tutor_messages m where m.conversation_id = "tutor_conversations"."id")`,
        ),
      )
      .limit(30);
    return {
      settings,
      providerReady: aiProvider().available(),
      provider: aiProvider().name,
      model: env().TUTOR_MODEL,
      day,
      week,
      month,
      recent,
    };
  });
}

export async function tutorConversation(admin: CurrentUser, id: string) {
  return withUser(db(), admin.id, async (tx) => {
    const conv = await tx.query.tutorConversations.findFirst({
      where: eq(s.tutorConversations.id, id),
    });
    if (!conv) throw notFound('Conversa');
    const mod = await tx.query.modules.findFirst({ where: eq(s.modules.id, conv.moduleId) });
    const student = await tx.query.profiles.findFirst({
      where: eq(s.profiles.userId, conv.studentId),
    });
    const messages = await tx
      .select()
      .from(s.tutorMessages)
      .where(eq(s.tutorMessages.conversationId, id))
      .orderBy(asc(s.tutorMessages.createdAt));
    await audit(tx, admin.id, 'tutor.conversation_viewed', { type: 'tutor_conversation', id });
    return {
      conv,
      moduleTitle: mod?.title ?? '',
      studentName: student?.displayName ?? 'Aluno',
      messages,
    };
  });
}

export const settingsInput = z.object({
  enabled: z
    .string()
    .nullish()
    .transform((v) => v === 'on' || v === 'true'),
  dailyLimit: z.coerce.number().int().min(0, 'Use 0 ou mais.').max(500, 'No máximo 500.'),
});

export async function saveTutorSettings(admin: CurrentUser, raw: unknown) {
  const v = settingsInput.parse(raw);
  return withUser(db(), admin.id, async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({ key: 'tutor', value: v, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value: v, updatedBy: admin.id, updatedAt: new Date() },
      });
    await audit(tx, admin.id, 'tutor.settings_updated', { type: 'app_settings', id: 'tutor' }, v);
  });
}
