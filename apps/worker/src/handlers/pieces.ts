import type { PiecePlan, PieceWriter } from '@gutta/ai';
import {
  assemblePiece,
  isPieceType,
  lintErrors,
  lintPiece,
  pieceFoot,
  type PieceBlocks,
} from '@gutta/core';
import { PIECE_FONT_CSS } from '@gutta/core/piece-fonts';
import { and, asc, eq, inArray, schema as s, withUser, type Tx } from '@gutta/db';
import { keys, type ObjectStorage } from '@gutta/storage';
import type { PieceRenderer } from '../pieces/render';
import type { Handler } from './types';

// Geração das peças HTML (docs/producao/ESPECIFICACAO.md, etapa 5; ADR 0021). Para cada tarefa
// aprovada: a IA escreve, o linter confere, o teste de render roda nos dois temas e, se algo
// falhar, a IA recebe os problemas e corrige. Cada tentativa vira uma versão, com as capturas.

export type PieceDeps = {
  storage: ObjectStorage | null;
  writer: PieceWriter | null;
  renderer: PieceRenderer | null;
  /** Tentativas por geração (a primeira e as correções). */
  maxAttempts?: number;
};

export const PIECE_MESSAGES = {
  noWriter:
    'A geração de peças não está disponível (falta a chave do Claude). Gere de novo quando a chave estiver configurada.',
  refused: 'A IA recusou escrever esta peça. Revise o plano e gere de novo.',
  dead: 'Não foi possível gerar esta peça agora. Gere de novo em alguns minutos.',
} as const;

const SHOT_NAMES: Record<string, string> = {
  'light-desktop': 'claro',
  'dark-desktop': 'escuro',
  'light-mobile': 'celular',
};

/** Quando não sobra tarefa gerando, o lote termina a geração. */
export async function settleBatch(tx: Tx, batchId: string) {
  const still = await tx
    .select({ id: s.productionTasks.id })
    .from(s.productionTasks)
    .where(and(eq(s.productionTasks.batchId, batchId), eq(s.productionTasks.status, 'generating')))
    .limit(1);
  if (!still.length)
    await tx
      .update(s.productionBatches)
      .set({ status: 'generated' })
      .where(
        and(eq(s.productionBatches.id, batchId), eq(s.productionBatches.status, 'generating')),
      );
}

export async function failTask(tx: Tx, taskId: string, batchId: string, error: string) {
  await tx
    .update(s.productionTasks)
    .set({ status: 'failed', lastError: error, pendingNote: null })
    .where(and(eq(s.productionTasks.id, taskId), eq(s.productionTasks.status, 'generating')));
  await settleBatch(tx, batchId);
}

export function productionGeneratePiece(deps: PieceDeps): Handler<'production.generate_piece'> {
  const maxAttempts = deps.maxAttempts ?? 3;
  return {
    run: async ({ taskId, userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      const loaded = await inTx(async (tx) => {
        const task = await tx.query.productionTasks.findFirst({
          where: eq(s.productionTasks.id, taskId),
        });
        if (!task || task.status !== 'generating') return null;
        const batch = (await tx.query.productionBatches.findFirst({
          where: eq(s.productionBatches.id, task.batchId),
        }))!;
        const discipline = await tx.query.disciplines.findFirst({
          where: eq(s.disciplines.id, batch.disciplineId),
        });
        const slides = await tx
          .select()
          .from(s.productionSlides)
          .where(
            and(
              eq(s.productionSlides.batchId, batch.id),
              inArray(
                s.productionSlides.number,
                task.targetSlides.length ? task.targetSlides : [-1],
              ),
            ),
          )
          .orderBy(asc(s.productionSlides.number));
        return { task, batch, discipline, slides };
      });
      if (!loaded) return;
      const { task, batch, slides } = loaded;
      if (!deps.writer || !deps.renderer)
        return void (await inTx((tx) => failTask(tx, taskId, batch.id, PIECE_MESSAGES.noWriter)));
      if (!deps.storage) throw new Error('armazenamento não configurado');
      const storage = deps.storage;
      const pieceType = task.pieceType && isPieceType(task.pieceType) ? task.pieceType : 'stepper';
      const disciplineName = loaded.discipline?.name ?? 'Disciplina';
      const pieceCtx = {
        crumb: `${disciplineName} · ${batch.title}`,
        foot: pieceFoot(batch.bibliography),
        demo: true,
        fontCss: PIECE_FONT_CSS,
      };
      const slideInputs = await Promise.all(
        slides.map(async (x) => ({
          number: x.number,
          text: x.text,
          image: x.hasImage ? await storage.get(keys.productionSlide(batch.id, x.number)) : null,
        })),
      );

      let version = task.currentVersion ?? 0;
      let previous: PieceBlocks | null = null;
      let problems: string[] = [];
      // Pedido de ajuste (admin, ou o revisor na Fase 4): a IA parte da versão atual.
      if (task.pendingNote && version > 0) {
        previous = JSON.parse(
          (await storage.get(keys.productionPiece(batch.id, taskId, version))).toString(),
        ) as PieceBlocks;
        problems = [`Pedido de ajuste: ${task.pendingNote}`];
      }
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await deps.writer.write({
          discipline: disciplineName,
          lesson: batch.title,
          bibliography: batch.bibliography,
          pieceType,
          title: task.title,
          instruction: task.instruction,
          plan: (task.plan as PiecePlan | null) ?? null,
          slides: slideInputs,
          fix: previous ? { previous, problems } : null,
        });
        await inTx((tx) =>
          tx.insert(s.aiUsage).values({
            ownerId: userId,
            feature: 'producao_peca',
            model: res.model,
            inputTokens: res.usage.input,
            outputTokens: res.usage.output,
            cacheReadTokens: res.usage.cacheRead,
            cacheWriteTokens: res.usage.cacheWrite,
            costMicros: res.costMicros,
            refused: res.refused,
          }),
        );
        if (res.refused)
          return void (await inTx((tx) => failTask(tx, taskId, batch.id, PIECE_MESSAGES.refused)));

        version += 1;
        const lint = lintPiece(res.blocks);
        const lintProblems = lintErrors(lint).map((i) => `Linter: ${i.message}`);
        const report = lintProblems.length
          ? null
          : await deps.renderer.test(assemblePiece(res.blocks, pieceCtx));
        problems = [...lintProblems, ...(report?.problems ?? [])];
        const ok = problems.length === 0;

        const pieceKey = keys.productionPiece(batch.id, taskId, version);
        await storage.put(pieceKey, Buffer.from(JSON.stringify(res.blocks)), 'application/json');
        const shots: { key: string; name: string }[] = [];
        for (const c of report?.checks ?? []) {
          const name = SHOT_NAMES[`${c.theme}-${c.viewport}`];
          if (!name || !c.screenshot.length) continue;
          const key = keys.productionShot(batch.id, taskId, version, name);
          await storage.put(key, c.screenshot, 'image/jpeg');
          shots.push({ key, name });
        }
        await inTx(async (tx) => {
          await tx.insert(s.productionAssets).values({
            batchId: batch.id,
            taskId,
            kind: 'html',
            version,
            provider: res.model === 'fake' ? 'fake' : 'claude',
            storageKey: pieceKey,
            costMicros: res.costMicros,
            meta: {
              attempt,
              ok,
              lint,
              problems,
              warnings: report?.warnings ?? [],
              tested: Boolean(report),
            },
          });
          if (shots.length)
            await tx.insert(s.productionAssets).values(
              shots.map((x) => ({
                batchId: batch.id,
                taskId,
                kind: 'screenshot' as const,
                version,
                provider: 'playwright',
                storageKey: x.key,
                meta: { view: x.name },
              })),
            );
          await tx
            .update(s.productionTasks)
            .set({ currentVersion: version, lastError: ok ? null : problems.join('\n') })
            .where(eq(s.productionTasks.id, taskId));
        });
        ctx.log.info('production.piece_attempt', {
          taskId,
          version,
          attempt,
          ok,
          problems: problems.length,
        });
        if (ok) {
          await inTx(async (tx) => {
            await tx
              .update(s.productionTasks)
              .set({ status: 'generated', lastError: null, pendingNote: null })
              .where(
                and(eq(s.productionTasks.id, taskId), eq(s.productionTasks.status, 'generating')),
              );
            await settleBatch(tx, batch.id);
          });
          return;
        }
        previous = res.blocks;
      }
      await inTx((tx) => failTask(tx, taskId, batch.id, problems.join('\n')));
    },
    onDead: async ({ taskId, userId }, ctx) => {
      await withUser(ctx.db, userId, async (tx) => {
        const task = await tx.query.productionTasks.findFirst({
          where: eq(s.productionTasks.id, taskId),
        });
        if (task) await failTask(tx, taskId, task.batchId, PIECE_MESSAGES.dead);
      });
    },
  };
}
