import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FakeLessonPlanner,
  FakePieceWriter,
  type LessonPlanner,
  type PlanInput,
  type PlanResult,
} from '@gutta/ai';
import { and, asc, eq, schema as s, sql } from '@gutta/db';
import { keys, MemoryStorage } from '@gutta/storage';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import { decodeXml, pageToSlide, readPptx, xmlText } from '../src/files/presentation';
import { NoScanner } from '../src/files/scanner';
import { filesProcess } from '../src/handlers/files';
import { PIECE_MESSAGES, productionGeneratePiece } from '../src/handlers/pieces';
import { PlaywrightRenderer } from '../src/pieces/render';
import { PRODUCTION_MESSAGES, productionExtract, productionPlan } from '../src/handlers/production';
import type { JobContext } from '../src/handlers/types';
import { logger } from '../src/logger';

// Produção de aulas, Fase 1 (ADR 0021): arquivo → slides → pedidos → plano.
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name));
const PPTX = fixture('aula-producao.pptx');
const PPT = fixture('aula-producao.ppt');
const PDF = fixture('aula.pdf');
const MIME = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
};

const { app, owner, appPool, ownerPool } = connect();
const store = new MemoryStorage();
const ctx = (): JobContext => ({ db: app, log: logger, jobId: 'teste', attempt: 1 });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const process = filesProcess({ storage: store, scanner: new NoScanner() });

/** Planejador que guarda a entrada e responde como o falso. */
class SpyPlanner implements LessonPlanner {
  inputs: PlanInput[] = [];
  async plan(input: PlanInput): Promise<PlanResult> {
    this.inputs.push(input);
    return new FakeLessonPlanner().plan(input);
  }
}

async function scenario(body: Buffer, mime: string) {
  const admin = await makeUser(owner, ['admin']);
  const topic = (await owner.query.topics.findFirst())!;
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: admin,
      originalName: 'aula',
      mime,
      sizeBytes: body.length,
      sha256: sha(body),
      status: 'scanning',
    })
    .returning();
  await store.put(keys.original(admin, f!.id), body, mime);
  const [b] = await owner
    .insert(s.productionBatches)
    .values({
      disciplineId: topic.disciplineId,
      topicId: topic.id,
      title: 'Aula de teste · Sinalização',
      fileId: f!.id,
      createdBy: admin,
    })
    .returning();
  return { admin, fileId: f!.id, batchId: b!.id };
}

const batchRow = async (id: string) =>
  (await owner.query.productionBatches.findFirst({ where: eq(s.productionBatches.id, id) }))!;
const slideRows = (id: string) =>
  owner
    .select()
    .from(s.productionSlides)
    .where(eq(s.productionSlides.batchId, id))
    .orderBy(asc(s.productionSlides.number));
const taskRows = (id: string) =>
  owner
    .select()
    .from(s.productionTasks)
    .where(eq(s.productionTasks.batchId, id))
    .orderBy(asc(s.productionTasks.position));

/** Do arquivo enviado até o plano, como na fila. */
async function runAll(body: Buffer, mime: string, planner: LessonPlanner | null) {
  const sc = await scenario(body, mime);
  await process.run({ fileId: sc.fileId, userId: sc.admin }, ctx());
  const deps = { storage: store, planner };
  await productionExtract(deps).run({ batchId: sc.batchId, userId: sc.admin }, ctx());
  await productionPlan(deps).run({ batchId: sc.batchId, userId: sc.admin }, ctx());
  return sc;
}

beforeAll(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'info').mockImplementation(() => {});
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('leitura do PPTX', () => {
  it('texto, notas e slide oculto, na numeração da apresentação', async () => {
    const slides = await readPptx(PPTX);
    expect(slides).toHaveLength(7);
    expect(slides[2]).toEqual({
      number: 3,
      text: 'NO SLIDE ANTERIOR, MONTAR UM ESQUEMA PARA SINALIZAÇÃO PARÁCRINA COM O ÓXIDO NÍTRICO',
      notes: 'Usar também a histamina dos mastócitos.',
      hidden: true,
    });
    expect(slides[1]!.text).toBe('Sinalização parácrina\nÓxido nítrico no endotélio vascular');
    expect(slides.filter((x) => x.hidden).map((x) => x.number)).toEqual([3]);
  });

  it('ignora número do slide, data e rodapé, e decodifica entidades', () => {
    const xml =
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><a:p><a:r><a:t>12</a:t></a:r></a:p></p:sp>' +
      '<p:sp><a:p><a:r><a:t>Ca²⁺ &amp; IP3 &lt;rápido&gt;</a:t></a:r><a:br/><a:r><a:t>DAG</a:t></a:r></a:p><a:p/></p:sp>';
    expect(xmlText(xml)).toBe('Ca²⁺ & IP3 <rápido>\nDAG');
    expect(decodeXml('&#233;&#x00E7;')).toBe('éç');
  });

  it('liga as páginas do PDF aos slides visíveis quando o oculto não sai no PDF', () => {
    const slides = [1, 2, 3, 4].map((n) => ({ number: n, hidden: n === 2 }));
    expect([...pageToSlide(slides, 3)!]).toEqual([
      [1, 1],
      [2, 3],
      [3, 4],
    ]);
    expect([...pageToSlide(slides, 4)!.values()]).toEqual([1, 2, 3, 4]);
    expect(pageToSlide(slides, 2)).toBeNull();
  });
});

describe('lote de produção', () => {
  it('arquivo pronto libera o lote: o evento de extração entra no outbox', async () => {
    const { admin, fileId, batchId } = await scenario(PPTX, MIME.pptx);
    await process.run({ fileId, userId: admin }, ctx());
    expect((await batchRow(batchId)).status).toBe('extracting');
    const events = await owner
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.topic, 'production.extract'),
          sql`${s.outbox.payload}->>'batchId' = ${batchId}`,
        ),
      );
    expect(events.map((e) => e.payload)).toEqual([{ batchId, userId: admin }]);
  });

  it('PPTX: slides com tipo, notas e imagem; pedidos detectados e planejados', async () => {
    const spy = new SpyPlanner();
    const { batchId } = await runAll(PPTX, MIME.pptx, spy);

    const batch = await batchRow(batchId);
    expect(batch.status).toBe('ready');
    expect(batch.mode).toBe('instructions');
    expect(batch.warnings).toEqual([]);
    expect(batch.planModel).toBe('fake');

    const slides = await slideRows(batchId);
    expect(slides.map((x) => x.kind)).toEqual([
      'content',
      'content',
      'instruction',
      'content',
      'content',
      'instruction',
      'instruction',
    ]);
    // O slide oculto não sai no PDF: sem imagem, mas com texto e notas.
    expect(slides.filter((x) => !x.hasImage).map((x) => x.number)).toEqual([3]);
    expect(slides[2]!.notes).toBe('Usar também a histamina dos mastócitos.');
    expect(await store.get(keys.productionSlide(batchId, 2))).toBeInstanceOf(Buffer);

    const tasks = await taskRows(batchId);
    expect(tasks.map((t) => [t.sourceSlides, t.targetSlides, t.priority])).toEqual([
      [[3], [2], false],
      [[6, 7], [4, 5], true],
    ]);
    expect(tasks.every((t) => t.status === 'proposed' && t.origin === 'instruction')).toBe(true);
    expect(tasks[0]!.pieceType).toBe('animation');
    expect(tasks[0]!.plan).toMatchObject({ pieceType: 'animation', fixar: expect.any(String) });

    // O planejador recebeu os pedidos e só as imagens dos slides-alvo.
    const input = spy.inputs[0]!;
    expect(input.tasks.map((t) => t.position)).toEqual([1, 2]);
    expect(input.slides.filter((x) => x.image).map((x) => x.number)).toEqual([2, 4, 5]);
    expect(input.bibliography).toBeNull();
  });

  it('PPT antigo é convertido e dá o mesmo resultado', async () => {
    const { batchId } = await runAll(PPT, MIME.ppt, new FakeLessonPlanner());
    expect((await batchRow(batchId)).status).toBe('ready');
    const tasks = await taskRows(batchId);
    expect(tasks.map((t) => t.sourceSlides)).toEqual([[3], [6, 7]]);
  }, 120_000);

  it('sem a chave do Claude: as tarefas vêm só da detecção, com título provisório e aviso', async () => {
    const { batchId } = await runAll(PPTX, MIME.pptx, null);
    const batch = await batchRow(batchId);
    expect(batch.status).toBe('ready');
    expect(batch.warnings).toEqual([PRODUCTION_MESSAGES.noPlanner]);
    const tasks = await taskRows(batchId);
    expect(tasks.map((t) => [t.title, t.pieceType, t.plan])).toEqual([
      ['Montar um esquema para sinalização parácrina com o óxido nítrico', null, null],
      ['Os dois slides anteriores são muito importantes', null, null],
    ]);
  });

  it('PDF sem pedidos: modo de proposta pelo conteúdo', async () => {
    const { batchId } = await runAll(PDF, MIME.pdf, new FakeLessonPlanner());
    const batch = await batchRow(batchId);
    expect(batch.mode).toBe('content');
    expect(batch.status).toBe('ready');
    const tasks = await taskRows(batchId);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.origin === 'proposed')).toBe(true);
    expect((await slideRows(batchId)).every((x) => x.hasImage)).toBe(true);
  });

  it('arquivo recusado: o lote falha com o motivo do arquivo', async () => {
    const { admin, fileId, batchId } = await scenario(Buffer.from('não é pptx'), MIME.pptx);
    await process.run({ fileId, userId: admin }, ctx());
    await productionExtract({ storage: store, planner: null }).run(
      { batchId, userId: admin },
      ctx(),
    );
    const batch = await batchRow(batchId);
    expect(batch.status).toBe('failed');
    expect(batch.error).toBe('O conteúdo não confere com o tipo do arquivo.');
  });

  it('repetir os trabalhos não duplica slides nem tarefas', async () => {
    const { admin, batchId } = await runAll(PPTX, MIME.pptx, new FakeLessonPlanner());
    const deps = { storage: store, planner: new FakeLessonPlanner() };
    await productionExtract(deps).run({ batchId, userId: admin }, ctx());
    await productionPlan(deps).run({ batchId, userId: admin }, ctx());
    expect(await slideRows(batchId)).toHaveLength(7);
    expect(await taskRows(batchId)).toHaveLength(2);
  });
});

describe('geração das peças (Fase 2)', () => {
  const renderer = new PlaywrightRenderer(globalThis.process.env.PIECE_CHROMIUM_PATH);
  afterAll(() => renderer.close());

  /** Lote planejado com as tarefas aprovadas já liberadas para gerar. */
  async function released() {
    const sc = await runAll(PPTX, MIME.pptx, new FakeLessonPlanner());
    await owner
      .update(s.productionTasks)
      .set({ status: 'generating' })
      .where(eq(s.productionTasks.batchId, sc.batchId));
    await owner
      .update(s.productionBatches)
      .set({ status: 'generating' })
      .where(eq(s.productionBatches.id, sc.batchId));
    return { ...sc, tasks: await taskRows(sc.batchId) };
  }
  const assetsOf = (taskId: string) =>
    owner
      .select()
      .from(s.productionAssets)
      .where(eq(s.productionAssets.taskId, taskId))
      .orderBy(asc(s.productionAssets.version), asc(s.productionAssets.kind));

  it('escreve, confere e testa nos dois temas; o lote termina quando todas terminam', async () => {
    const { admin, batchId, tasks } = await released();
    const writer = new FakePieceWriter();
    const gen = productionGeneratePiece({ storage: store, writer, renderer });
    await gen.run({ taskId: tasks[0]!.id, userId: admin }, ctx());
    let t = (await taskRows(batchId))[0]!;
    expect(t.status).toBe('generated');
    expect(t.currentVersion).toBe(1);
    expect((await batchRow(batchId)).status).toBe('generating');

    const assets = await assetsOf(t.id);
    expect(assets.map((a) => `${a.kind}:${a.version}`).sort()).toEqual(
      ['html:1', 'screenshot:1', 'screenshot:1', 'screenshot:1'].sort(),
    );
    const html = assets.find((a) => a.kind === 'html')!;
    expect(html.meta).toMatchObject({ ok: true, attempt: 1, problems: [] });
    const blocks = JSON.parse((await store.get(html.storageKey!)).toString());
    expect(blocks.title).toBe(t.title.replace(/[<>]/g, ''));
    // O escritor recebeu o plano, o pedido e a imagem do slide-alvo.
    expect(writer.calls[0]!.slides.map((x) => [x.number, Boolean(x.image)])).toEqual([[2, true]]);

    await gen.run({ taskId: tasks[1]!.id, userId: admin }, ctx());
    t = (await taskRows(batchId))[1]!;
    expect(t.status).toBe('generated');
    expect((await batchRow(batchId)).status).toBe('generated');
    const usage = await owner
      .select()
      .from(s.aiUsage)
      .where(and(eq(s.aiUsage.ownerId, admin), eq(s.aiUsage.feature, 'producao_peca')));
    expect(usage).toHaveLength(2);
  }, 120_000);

  it('peça com erro no render volta para a IA com os problemas e a correção passa', async () => {
    const { admin, batchId, tasks } = await released();
    const writer = new FakePieceWriter(1);
    await productionGeneratePiece({ storage: store, writer, renderer }).run(
      { taskId: tasks[0]!.id, userId: admin },
      ctx(),
    );
    const t = (await taskRows(batchId))[0]!;
    expect(t.status).toBe('generated');
    expect(t.currentVersion).toBe(2);
    expect(writer.calls).toHaveLength(2);
    expect(writer.calls[1]!.fix!.problems.join(' ')).toMatch(/Erro de script \(tema claro\)/);
    const html = (await assetsOf(t.id)).filter((a) => a.kind === 'html');
    expect(html.map((a) => (a.meta as { ok: boolean }).ok)).toEqual([false, true]);
  }, 120_000);

  it('sem corrigir depois das tentativas, a tarefa falha com os problemas', async () => {
    const { admin, batchId, tasks } = await released();
    await productionGeneratePiece({
      storage: store,
      writer: new FakePieceWriter(5),
      renderer,
      maxAttempts: 2,
    }).run({ taskId: tasks[0]!.id, userId: admin }, ctx());
    const t = (await taskRows(batchId))[0]!;
    expect(t.status).toBe('failed');
    expect(t.currentVersion).toBe(2);
    expect(t.lastError).toMatch(/Erro de script/);
  }, 120_000);

  it('sem a chave do Claude, a tarefa falha com aviso claro', async () => {
    const { admin, batchId, tasks } = await released();
    await productionGeneratePiece({ storage: store, writer: null, renderer }).run(
      { taskId: tasks[0]!.id, userId: admin },
      ctx(),
    );
    const t = (await taskRows(batchId))[0]!;
    expect(t.status).toBe('failed');
    expect(t.lastError).toBe(PIECE_MESSAGES.noWriter);
  });
});
