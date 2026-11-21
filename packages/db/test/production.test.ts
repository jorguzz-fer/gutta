import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser } from './helpers';

// Produção de aulas (ADR 0021): só o admin vê e altera lotes, slides e tarefas.
const { app, owner, appPool, ownerPool } = connect();

let admin: string;
let editor: string;
let aluno: string;
let revisor: string;
let batchId: string;

beforeAll(async () => {
  admin = await makeUser(owner, ['admin']);
  editor = await makeUser(owner, ['editor']);
  revisor = await makeUser(owner, ['reviewer']);
  aluno = await makeUser(owner);
  const topic = (await owner.query.topics.findFirst())!;
  const [file] = await owner
    .insert(s.files)
    .values({
      ownerId: admin,
      originalName: 'aula-1.ppt',
      mime: 'application/vnd.ms-powerpoint',
      sizeBytes: 10,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      status: 'ready',
    })
    .returning();
  const [batch] = await withUser(app, admin, (tx) =>
    tx
      .insert(s.productionBatches)
      .values({
        disciplineId: topic.disciplineId,
        topicId: topic.id,
        title: 'Aula 1 · Teste',
        fileId: file!.id,
        createdBy: admin,
      })
      .returning(),
  );
  batchId = batch!.id;
  await withUser(app, admin, async (tx) => {
    await tx.insert(s.productionSlides).values({ batchId, number: 1, kind: 'instruction' });
    await tx.insert(s.productionTasks).values({
      batchId,
      position: 1,
      origin: 'instruction',
      sourceSlides: [4],
      targetSlides: [3],
      instruction: 'No slide anterior, montar um esquema',
      title: 'Esquema',
    });
  });
});

afterAll(async () => {
  await owner.delete(s.productionBatches).where(eq(s.productionBatches.id, batchId));
  await appPool.end();
  await ownerPool.end();
});

describe('produção de aulas: acesso', () => {
  it('o admin lê o lote, os slides e as tarefas, com os slides como lista', async () => {
    const tasks = await withUser(app, admin, (tx) =>
      tx.select().from(s.productionTasks).where(eq(s.productionTasks.batchId, batchId)),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.sourceSlides).toEqual([4]);
    expect(tasks[0]!.status).toBe('proposed');
  });

  it('editor e aluno não veem nada nem conseguem gravar', async () => {
    for (const user of [editor, aluno]) {
      const rows = await withUser(app, user, async (tx) => ({
        batches: await tx.select().from(s.productionBatches),
        slides: await tx.select().from(s.productionSlides),
        tasks: await tx.select().from(s.productionTasks),
        assets: await tx.select().from(s.productionAssets),
      }));
      expect(rows).toEqual({ batches: [], slides: [], tasks: [], assets: [] });
      await expect(
        withUser(app, user, (tx) =>
          tx.insert(s.productionSlides).values({ batchId, number: 2, kind: 'content' }),
        ),
      ).rejects.toThrow();
      const updated = await withUser(app, user, (tx) =>
        tx
          .update(s.productionTasks)
          .set({ status: 'approved' })
          .where(eq(s.productionTasks.batchId, batchId))
          .returning(),
      );
      expect(updated).toEqual([]);
    }
  });

  it('revisor (Fase 4) lê a produção para revisar, mas não cria slides nem versões', async () => {
    const rows = await withUser(app, revisor, async (tx) => ({
      batches: await tx.select().from(s.productionBatches),
      tasks: await tx.select().from(s.productionTasks),
    }));
    expect(rows.batches.some((b) => b.id === batchId)).toBe(true);
    expect(rows.tasks.length).toBeGreaterThan(0);
    await expect(
      withUser(app, revisor, (tx) =>
        tx.insert(s.productionSlides).values({ batchId, number: 3, kind: 'content' }),
      ),
    ).rejects.toThrow();
    const task = rows.tasks.find((t) => t.batchId === batchId)!;
    await expect(
      withUser(app, revisor, (tx) =>
        tx.insert(s.productionAssets).values({
          batchId,
          taskId: task.id,
          kind: 'html',
          version: 99,
          provider: 'fake',
        }),
      ),
    ).rejects.toThrow();
    // A decisão é assinada pelo próprio revisor e não muda depois.
    await expect(
      withUser(app, revisor, (tx) =>
        tx.insert(s.productionReviews).values({
          batchId,
          taskId: task.id,
          version: 1,
          reviewerId: admin,
          decision: 'approved',
        }),
      ),
    ).rejects.toThrow();
    const [r] = await withUser(app, revisor, (tx) =>
      tx
        .insert(s.productionReviews)
        .values({ batchId, taskId: task.id, version: 1, reviewerId: revisor, decision: 'changes' })
        .returning(),
    );
    await expect(
      withUser(app, revisor, (tx) =>
        tx
          .update(s.productionReviews)
          .set({ decision: 'approved' })
          .where(eq(s.productionReviews.id, r!.id)),
      ),
    ).rejects.toThrow();
  });
});
