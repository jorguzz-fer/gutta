import 'server-only';
import { and, asc, desc, eq, ne, schema as s, sql, withUser, type Tx, inSequence } from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';

export type Status = (typeof s.contentStatus.enumValues)[number];

export const STATUS_LABEL: Record<Status, string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  approved: 'Aprovada',
  published: 'Publicada',
  archived: 'Arquivada',
};

export const questionDraftInput = z.object({
  topicId: z.uuid('Escolha o assunto.'),
  stem: z.string().trim().min(10, 'O enunciado precisa ter pelo menos 10 caracteres.').max(4000),
  difficulty: z.coerce.number().int().min(1).max(5),
  options: z
    .array(
      z.object({
        body: z.string().trim().min(1, 'Alternativa vazia.').max(1000),
        explanation: z.string().trim().max(2000).default(''),
        isCorrect: z.boolean(),
      }),
    )
    .min(2, 'Use de 2 a 6 alternativas.')
    .max(6, 'Use de 2 a 6 alternativas.'),
  sources: z
    .array(
      z.object({
        citation: z.string().trim().min(3).max(500),
        url: z.url().optional().or(z.literal('')),
      }),
    )
    .max(10)
    .default([]),
});
export type QuestionDraft = z.infer<typeof questionDraftInput>;

/** O que precisa estar pronto para ir à revisão (SPEC CAT-01). */
export function readinessProblems(q: QuestionDraft): string[] {
  const problems: string[] = [];
  const correct = q.options.filter((o) => o.isCorrect).length;
  if (correct !== 1) problems.push('Marque exatamente uma alternativa correta.');
  if (q.options.some((o) => !o.explanation)) problems.push('Explique a correta e cada incorreta.');
  if (new Set(q.options.map((o) => o.body.toLowerCase())).size !== q.options.length)
    problems.push('Há alternativas repetidas.');
  return problems;
}

function mapDbError(err: unknown): never {
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code === '42501')
    throw new ApiError(403, 'forbidden', cause.message ?? 'Sem permissão para essa ação.');
  if (cause?.code === '23514')
    throw new ApiError(409, 'invalid_transition', cause.message ?? 'Transição inválida.');
  throw err;
}

async function load(tx: Tx, id: string) {
  const q = await tx.query.questions.findFirst({ where: eq(s.questions.id, id) });
  if (!q) throw notFound('Questão');
  const [options, sources] = await inSequence([
    () =>
      tx
        .select()
        .from(s.questionOptions)
        .where(eq(s.questionOptions.questionId, id))
        .orderBy(asc(s.questionOptions.displayOrder)),
    () => tx.select().from(s.questionSources).where(eq(s.questionSources.questionId, id)),
  ]);
  return { ...q, options, sources };
}

export async function getQuestion(user: CurrentUser, id: string) {
  return withUser(db(), user.id, async (tx) => {
    const q = await load(tx, id);
    const [topic, stats, versions, history] = await inSequence([
      () =>
        tx
          .select({ topicName: s.topics.name, disciplineName: s.disciplines.name })
          .from(s.topics)
          .innerJoin(s.disciplines, eq(s.disciplines.id, s.topics.disciplineId))
          .where(eq(s.topics.id, q.topicId))
          .then((r) => r[0]),
      () =>
        // Estatística de uso (revisor/admin): o RLS só libera para esses papéis.
        tx
          .select({
            attempts: sql<number>`count(*)::int`,
            correct: sql<number>`count(*) filter (where ${s.questionAttempts.isCorrect})::int`,
          })
          .from(s.questionAttempts)
          .where(eq(s.questionAttempts.questionId, id))
          .then((r) => r[0]),
      () =>
        tx
          .select({ id: s.questions.id, version: s.questions.version, status: s.questions.status })
          .from(s.questions)
          .where(eq(s.questions.rootId, q.rootId ?? q.id))
          .orderBy(desc(s.questions.version)),
      () =>
        user.roles.includes('admin')
          ? tx
              .select()
              .from(s.auditLogs)
              .where(and(eq(s.auditLogs.entityType, 'question'), eq(s.auditLogs.entityId, id)))
              .orderBy(desc(s.auditLogs.createdAt))
              .limit(20)
          : Promise.resolve([]),
    ]);
    return { ...q, ...topic, stats, versions, history };
  });
}

export async function listQuestions(
  user: CurrentUser,
  filter: { status?: Status; mine?: boolean },
) {
  return withUser(db(), user.id, async (tx) => {
    const rows = await tx
      .select({
        id: s.questions.id,
        stem: s.questions.stem,
        status: s.questions.status,
        version: s.questions.version,
        isDemo: s.questions.isDemo,
        updatedAt: s.questions.updatedAt,
        authorId: s.questions.authorId,
        authorName: s.profiles.displayName,
        topicName: s.topics.name,
      })
      .from(s.questions)
      .innerJoin(s.topics, eq(s.topics.id, s.questions.topicId))
      .leftJoin(s.profiles, eq(s.profiles.userId, s.questions.authorId))
      .where(
        and(
          filter.status ? eq(s.questions.status, filter.status) : undefined,
          filter.mine ? eq(s.questions.authorId, user.id) : undefined,
        ),
      )
      .orderBy(desc(s.questions.updatedAt))
      .limit(200);
    const counts = await tx
      .select({ status: s.questions.status, n: sql<number>`count(*)::int` })
      .from(s.questions)
      .groupBy(s.questions.status);
    return {
      rows,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<
        Record<Status, number>
      >,
    };
  });
}

export async function editorialTopics(user: CurrentUser) {
  return withUser(db(), user.id, (tx) =>
    tx
      .select({
        id: s.topics.id,
        name: s.topics.name,
        parentId: s.topics.parentId,
        disciplineName: s.disciplines.name,
      })
      .from(s.topics)
      .innerJoin(s.disciplines, eq(s.disciplines.id, s.topics.disciplineId))
      .orderBy(asc(s.disciplines.name), asc(s.topics.orderIndex)),
  );
}

async function writeChildren(tx: Tx, questionId: string, d: QuestionDraft) {
  await tx.delete(s.questionOptions).where(eq(s.questionOptions.questionId, questionId));
  await tx.delete(s.questionSources).where(eq(s.questionSources.questionId, questionId));
  // Insere corretas por último? Não: o índice parcial permite no máximo uma; o formulário garante.
  await tx.insert(s.questionOptions).values(
    d.options.map((o, i) => ({
      questionId,
      displayOrder: i,
      body: o.body,
      explanation: o.explanation,
      isCorrect: o.isCorrect,
    })),
  );
  if (d.sources.length) {
    await tx.insert(s.questionSources).values(
      d.sources.map((src) => ({
        questionId,
        citation: src.citation,
        url: src.url || null,
        accessedAt: new Date(),
      })),
    );
  }
}

export async function createQuestion(user: CurrentUser, d: QuestionDraft) {
  if (d.options.filter((o) => o.isCorrect).length > 1)
    throw new ApiError(400, 'invalid', 'Só uma alternativa pode ser a correta.');
  return withUser(db(), user.id, async (tx) => {
    const topic = await tx.query.topics.findFirst({ where: eq(s.topics.id, d.topicId) });
    if (!topic) throw notFound('Assunto');
    try {
      const [q] = await tx
        .insert(s.questions)
        .values({
          topicId: d.topicId,
          disciplineId: topic.disciplineId,
          stem: d.stem,
          difficulty: d.difficulty,
          authorId: user.id,
        })
        .returning();
      await writeChildren(tx, q!.id, d);
      await audit(tx, user.id, 'question.created', { type: 'question', id: q!.id });
      return { id: q!.id };
    } catch (err) {
      mapDbError(err);
    }
  });
}

/** Edita rascunho (ou questão em revisão, que volta a rascunho). Publicada vira nova versão. */
export async function updateQuestion(user: CurrentUser, id: string, d: QuestionDraft) {
  if (d.options.filter((o) => o.isCorrect).length > 1)
    throw new ApiError(400, 'invalid', 'Só uma alternativa pode ser a correta.');
  return withUser(db(), user.id, async (tx) => {
    const q = await load(tx, id);
    if (q.status !== 'draft')
      throw new ApiError(
        409,
        'not_draft',
        'Só rascunhos podem ser editados. Crie uma nova versão.',
      );
    const topic = await tx.query.topics.findFirst({ where: eq(s.topics.id, d.topicId) });
    if (!topic) throw notFound('Assunto');
    try {
      await tx
        .update(s.questions)
        .set({
          topicId: d.topicId,
          disciplineId: topic.disciplineId,
          stem: d.stem,
          difficulty: d.difficulty,
        })
        .where(eq(s.questions.id, id));
      await writeChildren(tx, id, d);
      await audit(tx, user.id, 'question.edited', { type: 'question', id });
      return { id };
    } catch (err) {
      mapDbError(err);
    }
  });
}

export async function newVersion(user: CurrentUser, id: string) {
  return withUser(db(), user.id, async (tx) => {
    const q = await load(tx, id);
    if (!['published', 'archived', 'approved'].includes(q.status)) {
      throw new ApiError(409, 'not_needed', 'Rascunhos e questões em revisão são editados direto.');
    }
    const rootId = q.rootId ?? q.id;
    const pending = await tx.query.questions.findFirst({
      where: and(
        eq(s.questions.rootId, rootId),
        sql`${s.questions.status} in ('draft','in_review')`,
      ),
    });
    if (pending) return { id: pending.id, existing: true };
    const latest = await tx
      .select({ v: sql<number>`max(${s.questions.version})::int` })
      .from(s.questions)
      .where(eq(s.questions.rootId, rootId));
    try {
      const [copy] = await tx
        .insert(s.questions)
        .values({
          rootId,
          version: (latest[0]?.v ?? q.version) + 1,
          topicId: q.topicId,
          disciplineId: q.disciplineId,
          stem: q.stem,
          difficulty: q.difficulty,
          isDemo: q.isDemo,
          authorId: user.id,
        })
        .returning();
      await tx.insert(s.questionOptions).values(
        q.options.map((o) => ({
          questionId: copy!.id,
          displayOrder: o.displayOrder,
          body: o.body,
          explanation: o.explanation,
          isCorrect: o.isCorrect,
        })),
      );
      if (q.sources.length) {
        await tx.insert(s.questionSources).values(
          q.sources.map((src) => ({
            questionId: copy!.id,
            citation: src.citation,
            url: src.url,
            accessedAt: src.accessedAt,
          })),
        );
      }
      await audit(
        tx,
        user.id,
        'question.new_version',
        { type: 'question', id: copy!.id },
        { from: id },
      );
      return { id: copy!.id, existing: false };
    } catch (err) {
      mapDbError(err);
    }
  });
}

export const transitionInput = z.object({
  to: z.enum(['draft', 'in_review', 'approved', 'published', 'archived']),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Muda o status editorial. Regras da SPEC (ADM-01): o autor não aprova o próprio conteúdo,
 * só revisor aprova, publica e arquiva, e publicar uma versão arquiva a anterior.
 * O banco impõe as mesmas regras (trigger), então esta camada só dá mensagens melhores.
 */
export async function transition(
  user: CurrentUser,
  id: string,
  input: z.infer<typeof transitionInput>,
) {
  const isReviewer = user.roles.includes('reviewer') || user.roles.includes('admin');
  return withUser(db(), user.id, async (tx) => {
    const q = await load(tx, id);
    const from = q.status;
    const to = input.to;
    if (to === 'in_review') {
      const problems = readinessProblems({
        topicId: q.topicId,
        stem: q.stem,
        difficulty: q.difficulty,
        options: q.options.map((o) => ({
          body: o.body,
          explanation: o.explanation,
          isCorrect: o.isCorrect,
        })),
        sources: [],
      });
      if (q.options.length < 2 || q.options.length > 6) problems.push('Use de 2 a 6 alternativas.');
      if (problems.length) throw new ApiError(409, 'not_ready', problems.join(' '), problems);
    }
    if (
      ['approved', 'published', 'archived'].includes(to) ||
      (from === 'in_review' && to === 'draft')
    ) {
      if (!isReviewer)
        throw new ApiError(
          403,
          'forbidden',
          'Só quem revisa pode aprovar, devolver, publicar ou arquivar.',
        );
    }
    if (to === 'approved' && q.authorId === user.id) {
      throw new ApiError(
        403,
        'forbidden',
        'Quem escreveu a questão não pode aprová-la. Peça a outra pessoa da revisão.',
      );
    }
    try {
      if (to === 'published') {
        // A versão publicada anterior sai do estudo, mas continua referenciável nas tentativas antigas.
        const previous = await tx
          .select({ id: s.questions.id })
          .from(s.questions)
          .where(
            and(
              eq(s.questions.rootId, q.rootId ?? q.id),
              eq(s.questions.status, 'published'),
              ne(s.questions.id, id),
            ),
          );
        for (const p of previous) {
          await tx.update(s.questions).set({ status: 'archived' }).where(eq(s.questions.id, p.id));
          await audit(
            tx,
            user.id,
            'question.archived',
            { type: 'question', id: p.id },
            { reason: 'nova versão publicada', by: id },
          );
        }
      }
      await tx
        .update(s.questions)
        .set({
          status: to,
          ...(input.notes !== undefined ? { reviewNotes: input.notes || null } : {}),
        })
        .where(eq(s.questions.id, id));
      await audit(
        tx,
        user.id,
        `question.${to}`,
        { type: 'question', id },
        { from, notes: input.notes ?? null },
      );
      return { id, status: to };
    } catch (err) {
      mapDbError(err);
    }
  });
}
