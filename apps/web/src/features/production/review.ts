import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PiecePlan } from '@gutta/ai';
import { VIDEO_SRC_PLACEHOLDER, assemblePiece, pieceFoot, type PieceBlocks } from '@gutta/core';
import { PIECE_FONT_CSS } from '@gutta/core/piece-fonts';
import { and, asc, desc, eq, inArray, isNotNull, schema as s, withUser, type Tx } from '@gutta/db';
import type { production as contract } from '@gutta/contracts';
import { keys } from '@gutta/storage';
import type { z } from 'zod';
import { slugify } from '@/features/admin/service';
import { ApiError, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';
import { storage } from '@/lib/storage';
import { escapeAttr, getTask, startGeneration } from './service';

// Revisão e publicação (docs/producao/ESPECIFICACAO.md, Fase 4; ADR 0021). A peça gerada vira
// módulo e as questões do plano viram questões, as duas em revisão e com o selo de demonstração.
// O revisor aprova (o selo some) ou pede ajuste com um comentário, e a peça é gerada de novo a
// partir dele. Depois, a aula é publicada e o aluno vê a versão aprovada. O banco garante o
// resto (migration 0001): só revisor aprova e publica, e o autor não aprova o próprio conteúdo.

type TaskRow = typeof s.productionTasks.$inferSelect;
type ModuleRow = typeof s.modules.$inferSelect;

/** Endereço da aula publicada, servido pelo próprio app com a política isolada da peça. */
export const lessonPath = (moduleId: string) => `/api/v1/production/lessons/${moduleId}`;

/** Pacote da peça publicada: o aluno não lê a produção, só este arquivo da versão aprovada. */
const publishedKey = (moduleId: string) => `p/pub/${moduleId}.json`;
type PublishedBundle = {
  blocks: PieceBlocks;
  crumb: string;
  foot: string;
  videoKey: string | null;
};

const pgCode = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
};

/** O banco recusa o autor aprovando o próprio conteúdo: vira uma mensagem clara. */
async function editorial<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (pgCode(err) === '42501')
      throw new ApiError(
        403,
        'forbidden',
        'Quem enviou a peça para revisão não pode aprová-la. Peça a outro revisor.',
      );
    throw err;
  }
}

/** Envia para revisão as peças prontas do lote que ainda não têm módulo. */
export async function sendToReview(userId: string, batchId: string) {
  return withUser(db(), userId, async (tx) => {
    const batch = await tx.query.productionBatches.findFirst({
      where: eq(s.productionBatches.id, batchId),
    });
    if (!batch) throw notFound('Lote');
    const tasks = await tx
      .select()
      .from(s.productionTasks)
      .where(and(eq(s.productionTasks.batchId, batchId), eq(s.productionTasks.status, 'generated')))
      .orderBy(asc(s.productionTasks.position));
    const pending = tasks.filter((t) => !t.moduleId);
    if (!pending.length)
      throw conflict('Nenhuma peça pronta para enviar. Gere as peças antes de enviar à revisão.');
    let questions = 0;
    const skipped: string[] = [];
    for (const t of pending) {
      const plan = (t.plan as PiecePlan | null) ?? null;
      const moduleId = randomUUID();
      await tx.insert(s.modules).values({
        id: moduleId,
        disciplineId: batch.disciplineId,
        topicId: batch.topicId,
        slug: `${slugify(t.title).slice(0, 60) || 'peca'}-${t.id.slice(0, 6)}`,
        title: t.title,
        lead: plan?.lead ?? null,
        lessonUrl: lessonPath(moduleId),
        estMinutes: 5,
        orderIndex: batch.position * 100 + t.position,
        status: 'in_review',
        isDemo: true,
        authorId: userId,
      });
      const ids: string[] = [];
      for (const [i, q] of (plan?.questions ?? []).entries()) {
        // Questão sem exatamente uma correta não vai: o banco e o aluno precisam do gabarito certo.
        if (q.options.filter((o) => o.correct).length !== 1) {
          skipped.push(`${t.title}, questão ${i + 1}`);
          continue;
        }
        const [row] = await tx
          .insert(s.questions)
          .values({
            topicId: batch.topicId,
            disciplineId: batch.disciplineId,
            stem: q.stem,
            difficulty: q.kind === 'conceito' ? 2 : 3,
            status: 'in_review',
            isDemo: true,
            authorId: userId,
            reviewNotes: `Gerada pela produção de aulas (${q.kind.replace('_', ' ')}), peça "${t.title}".`,
          })
          .returning({ id: s.questions.id });
        await tx.insert(s.questionOptions).values(
          q.options.map((o, j) => ({
            questionId: row!.id,
            displayOrder: j + 1,
            body: o.text,
            isCorrect: o.correct,
            explanation: o.correct ? `${o.why} ${q.explanation}`.trim() : o.why,
          })),
        );
        // A única fonte é a referência que o professor pôs na aula; nada é inventado.
        if (batch.bibliography)
          await tx
            .insert(s.questionSources)
            .values({ questionId: row!.id, citation: batch.bibliography });
        ids.push(row!.id);
      }
      questions += ids.length;
      await tx
        .update(s.productionTasks)
        .set({ moduleId, questionIds: ids })
        .where(eq(s.productionTasks.id, t.id));
    }
    await audit(
      tx,
      userId,
      'production.sent_to_review',
      { type: 'production_batch', id: batchId },
      { pieces: pending.length, questions },
    );
    return { sent: pending.length, questions, skipped };
  });
}

/** Fila do revisor: peças em revisão e aulas com peças aprovadas esperando a publicação. */
export async function reviewQueue(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const rows = await tx
      .select({ task: s.productionTasks, mod: s.modules, batch: s.productionBatches })
      .from(s.productionTasks)
      .innerJoin(s.modules, eq(s.modules.id, s.productionTasks.moduleId))
      .innerJoin(s.productionBatches, eq(s.productionBatches.id, s.productionTasks.batchId))
      .where(isNotNull(s.productionTasks.moduleId))
      .orderBy(desc(s.productionBatches.createdAt), asc(s.productionTasks.position));
    const disciplines = new Map(
      (await tx.select({ id: s.disciplines.id, name: s.disciplines.name }).from(s.disciplines)).map(
        (d) => [d.id, d.name],
      ),
    );
    const items: contract.ReviewItemDto[] = rows
      .filter(
        (r) =>
          r.mod.status === 'in_review' ||
          r.mod.status === 'approved' ||
          (r.mod.status === 'published' &&
            (r.mod.publishedAt?.getTime() ?? 0) > Date.now() - 7 * 24 * 3600 * 1000),
      )
      .map((r) => ({
        taskId: r.task.id,
        batchId: r.batch.id,
        batchTitle: r.batch.title,
        disciplineName: disciplines.get(r.batch.disciplineId) ?? '',
        title: r.task.title,
        position: r.task.position,
        pieceType: r.task.pieceType as contract.TaskDto['pieceType'],
        moduleStatus: r.mod.status as 'in_review' | 'approved' | 'published',
        taskStatus: r.task.status,
        questions: r.task.questionIds.length,
        backFromChanges: r.task.backToReview,
      }));
    return { items };
  });
}

async function loadForReview(tx: Tx, taskId: string) {
  const task = await tx.query.productionTasks.findFirst({
    where: eq(s.productionTasks.id, taskId),
  });
  if (!task?.moduleId) throw notFound('Peça em revisão');
  const mod = (await tx.query.modules.findFirst({ where: eq(s.modules.id, task.moduleId) }))!;
  return { task, mod };
}

/** Tudo o que o revisor confere: a peça (via getTask), o que a IA pediu atenção e as questões. */
export async function getReview(userId: string, taskId: string) {
  const base = await getTask(userId, taskId);
  return withUser(db(), userId, async (tx) => {
    const { task, mod } = await loadForReview(tx, taskId);
    const qs = task.questionIds.length
      ? await tx.select().from(s.questions).where(inArray(s.questions.id, task.questionIds))
      : [];
    const opts = qs.length
      ? await tx
          .select()
          .from(s.questionOptions)
          .where(
            inArray(
              s.questionOptions.questionId,
              qs.map((q) => q.id),
            ),
          )
          .orderBy(asc(s.questionOptions.displayOrder))
      : [];
    const reviews = await tx
      .select({
        review: s.productionReviews,
        name: s.authUsers.name,
      })
      .from(s.productionReviews)
      .leftJoin(s.authUsers, eq(s.authUsers.id, s.productionReviews.reviewerId))
      .where(eq(s.productionReviews.taskId, taskId))
      .orderBy(desc(s.productionReviews.createdAt));
    const plan = (task.plan as PiecePlan | null) ?? null;
    return {
      ...base,
      module: moduleDto(mod),
      reviewNotes: plan?.reviewNotes ?? [],
      scenarios: (plan?.scenarios ?? []).map((x) => x.label),
      questions: task.questionIds
        .map((id) => qs.find((q) => q.id === id))
        .filter((q) => q !== undefined)
        .map((q) => ({
          id: q.id,
          stem: q.stem,
          status: q.status as contract.ModuleDto['status'],
          options: opts
            .filter((o) => o.questionId === q.id)
            .map((o) => ({ body: o.body, correct: o.isCorrect, explanation: o.explanation })),
        })),
      reviews: reviews.map((r) => ({
        id: r.review.id,
        version: r.review.version,
        decision: r.review.decision as 'approved' | 'changes',
        excerpt: r.review.excerpt,
        comment: r.review.comment,
        reviewer: r.name ?? 'Revisor',
        createdAt: r.review.createdAt.toISOString(),
      })),
    };
  });
}

const moduleDto = (m: ModuleRow): contract.ModuleDto => ({
  id: m.id,
  status: m.status as contract.ModuleDto['status'],
  isDemo: m.isDemo,
  publishedAt: m.publishedAt?.toISOString() ?? null,
});

function reviewable(task: TaskRow, mod: ModuleRow) {
  if (mod.status !== 'in_review') throw conflict('Esta peça não está em revisão.');
  if (task.status !== 'generated' || !task.currentVersion)
    throw conflict('A peça ainda está sendo gerada de novo. Revise quando a nova versão chegar.');
}

/** Aprova a versão atual: o módulo e as questões saem do modo demonstração. */
export async function approveReview(
  userId: string,
  taskId: string,
  body: z.output<typeof contract.approveReviewBody>,
) {
  return editorial(() =>
    withUser(db(), userId, async (tx) => {
      const { task, mod } = await loadForReview(tx, taskId);
      reviewable(task, mod);
      const discard = new Set(body.discardQuestions.filter((id) => task.questionIds.includes(id)));
      const keep = task.questionIds.filter((id) => !discard.has(id));
      await tx
        .update(s.modules)
        .set({ status: 'approved', isDemo: false })
        .where(eq(s.modules.id, mod.id));
      if (keep.length)
        await tx
          .update(s.questions)
          .set({ status: 'approved', isDemo: false })
          .where(and(inArray(s.questions.id, keep), eq(s.questions.status, 'in_review')));
      // Questão descartada volta para rascunho, fora da aula (fica no banco de questões).
      if (discard.size)
        await tx
          .update(s.questions)
          .set({ status: 'draft' })
          .where(and(inArray(s.questions.id, [...discard]), eq(s.questions.status, 'in_review')));
      await tx
        .update(s.productionTasks)
        .set({ approvedVersion: task.currentVersion, questionIds: keep, backToReview: false })
        .where(eq(s.productionTasks.id, taskId));
      await tx.insert(s.productionReviews).values({
        batchId: task.batchId,
        taskId,
        version: task.currentVersion!,
        reviewerId: userId,
        decision: 'approved',
        comment: body.comment,
      });
      await audit(
        tx,
        userId,
        'production.review_approved',
        { type: 'production_task', id: taskId },
        { version: task.currentVersion, discarded: discard.size },
      );
      return { module: moduleDto((await loadForReview(tx, taskId)).mod) };
    }),
  );
}

/** Pede ajuste: o comentário vai para a IA, que gera de novo; a peça volta à fila sozinha. */
export async function requestChanges(
  userId: string,
  taskId: string,
  body: z.output<typeof contract.requestChangesBody>,
) {
  return withUser(db(), userId, async (tx) => {
    const { task, mod } = await loadForReview(tx, taskId);
    reviewable(task, mod);
    await tx.insert(s.productionReviews).values({
      batchId: task.batchId,
      taskId,
      version: task.currentVersion!,
      reviewerId: userId,
      decision: 'changes',
      excerpt: body.excerpt,
      comment: body.comment,
    });
    const note = body.excerpt
      ? `Revisão médica, trecho "${body.excerpt}": ${body.comment}`
      : `Revisão médica: ${body.comment}`;
    const batch = await tx.query.productionBatches.findFirst({
      where: eq(s.productionBatches.id, task.batchId),
    });
    await startGeneration(tx, userId, task, note, batch?.createdBy ?? userId);
    await tx
      .update(s.productionTasks)
      .set({ backToReview: true })
      .where(eq(s.productionTasks.id, taskId));
    await tx
      .update(s.productionBatches)
      .set({ status: 'generating' })
      .where(eq(s.productionBatches.id, task.batchId));
    await audit(
      tx,
      userId,
      'production.review_changes',
      { type: 'production_task', id: taskId },
      { version: task.currentVersion, excerpt: body.excerpt },
    );
    return { ok: true as const };
  });
}

/** Publica as peças aprovadas da aula: módulos e questões ficam visíveis para os alunos. */
export async function publishBatch(userId: string, batchId: string) {
  const store = storage();
  if (!store) throw notFound('Armazenamento');
  return editorial(() =>
    withUser(db(), userId, async (tx) => {
      const batch = await tx.query.productionBatches.findFirst({
        where: eq(s.productionBatches.id, batchId),
      });
      if (!batch) throw notFound('Lote');
      const discipline = await tx.query.disciplines.findFirst({
        where: eq(s.disciplines.id, batch.disciplineId),
      });
      const rows = await tx
        .select({ task: s.productionTasks, mod: s.modules })
        .from(s.productionTasks)
        .innerJoin(s.modules, eq(s.modules.id, s.productionTasks.moduleId))
        .where(and(eq(s.productionTasks.batchId, batchId), eq(s.modules.status, 'approved')));
      if (!rows.length) throw conflict('Nenhuma peça aprovada nesta aula para publicar.');
      for (const { task, mod } of rows) {
        const version = task.approvedVersion ?? task.currentVersion!;
        const blocks = JSON.parse(
          (await store.get(keys.productionPiece(batchId, task.id, version))).toString(),
        ) as PieceBlocks;
        const html = await tx.query.productionAssets.findFirst({
          where: and(
            eq(s.productionAssets.taskId, task.id),
            eq(s.productionAssets.kind, 'html'),
            eq(s.productionAssets.version, version),
          ),
        });
        const videoId = (html?.meta as { video?: string } | undefined)?.video;
        const video = videoId
          ? await tx.query.productionAssets.findFirst({
              where: eq(s.productionAssets.id, videoId),
            })
          : undefined;
        const bundle: PublishedBundle = {
          blocks,
          crumb: `${discipline?.name ?? 'Disciplina'} · ${batch.title}`,
          foot: pieceFoot(batch.bibliography),
          videoKey: video?.storageKey ?? null,
        };
        await store.put(
          publishedKey(mod.id),
          Buffer.from(JSON.stringify(bundle)),
          'application/json',
        );
        await tx.update(s.modules).set({ status: 'published' }).where(eq(s.modules.id, mod.id));
        if (task.questionIds.length)
          await tx
            .update(s.questions)
            .set({ status: 'published' })
            .where(
              and(inArray(s.questions.id, task.questionIds), eq(s.questions.status, 'approved')),
            );
      }
      await audit(
        tx,
        userId,
        'production.published',
        { type: 'production_batch', id: batchId },
        { pieces: rows.length },
      );
      return { published: rows.length };
    }),
  );
}

/**
 * HTML da aula publicada, para o aluno. O módulo passa pelo RLS (publicado, ou equipe
 * editorial); a peça vem do pacote da versão aprovada, e o selo segue o módulo.
 */
export async function lessonHtml(userId: string, moduleId: string): Promise<string> {
  const store = storage();
  if (!store) throw notFound('Armazenamento');
  const mod = await withUser(db(), userId, (tx) =>
    tx.query.modules.findFirst({ where: eq(s.modules.id, moduleId) }),
  );
  if (!mod || mod.lessonUrl !== lessonPath(moduleId)) throw notFound('Aula');
  let bundle: PublishedBundle;
  try {
    bundle = JSON.parse((await store.get(publishedKey(moduleId))).toString()) as PublishedBundle;
  } catch {
    throw notFound('Aula');
  }
  const blocks = { ...bundle.blocks };
  if (blocks.body.includes(VIDEO_SRC_PLACEHOLDER)) {
    const src = bundle.videoKey
      ? await store.getUrl(bundle.videoKey, {
          contentType: 'video/mp4',
          disposition: 'inline',
          expiresIn: 60 * 60,
        })
      : '';
    blocks.body = blocks.body.replaceAll(VIDEO_SRC_PLACEHOLDER, escapeAttr(src));
  }
  return assemblePiece(blocks, {
    crumb: bundle.crumb,
    foot: bundle.foot,
    demo: mod.isDemo,
    fontCss: PIECE_FONT_CSS,
  });
}
