import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeStoryboardWriter, MediaBlocked, MediaRetryLater } from '@gutta/ai';
import { and, asc, desc, eq, schema as s, sql } from '@gutta/db';
import { MemoryStorage } from '@gutta/storage';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import {
  MEDIA_MESSAGES,
  MEDIA_SETTINGS_KEY,
  productionGenerateMedia,
  productionWriteStoryboard,
  type MediaDeps,
} from '../src/handlers/media';
import { FakeMediaProvider, FakeNarrator } from '../src/media/fake';
import type { JobContext } from '../src/handlers/types';
import { logger } from '../src/logger';
import { PlaywrightRenderer } from '../src/pieces/render';

// Vídeos da produção de aulas (Fase 3, ADR 0021), do roteiro ao MP4, com os provedores de
// teste (ffmpeg local, sem rede): duas aprovações do admin, consulta ao provedor, cota do dia,
// pausa por saldo e a regra de nunca pagar duas vezes pelo mesmo pedido.

const { app, owner, appPool, ownerPool } = connect();
const store = new MemoryStorage();
const renderer = new PlaywrightRenderer(globalThis.process.env.PIECE_CHROMIUM_PATH);
const ctx = (): JobContext => ({ db: app, log: logger, jobId: 'teste', attempt: 1 });

beforeAll(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'info').mockImplementation(() => {});
});
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, MEDIA_SETTINGS_KEY));
  await renderer.close();
  await appPool.end();
  await ownerPool.end();
});

/** Lote com uma tarefa de vídeo liberada para gerar (etapa do roteiro). */
async function videoTask() {
  const admin = await makeUser(owner, ['admin']);
  const topic = (await owner.query.topics.findFirst())!;
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: admin,
      originalName: 'aula.pptx',
      mime: 'application/pdf',
      sizeBytes: 1,
      sha256: 'a'.repeat(64),
      status: 'ready',
    })
    .returning();
  const [b] = await owner
    .insert(s.productionBatches)
    .values({
      disciplineId: topic.disciplineId,
      topicId: topic.id,
      title: 'Aula 1 · Fisiologia endócrina',
      fileId: f!.id,
      createdBy: admin,
      status: 'generating',
    })
    .returning();
  const [t] = await owner
    .insert(s.productionTasks)
    .values({
      batchId: b!.id,
      position: 9,
      origin: 'instruction',
      sourceSlides: [],
      targetSlides: [],
      instruction: 'Mostrar o vídeo da insulina: zoom do corpo até o receptor na célula.',
      pieceType: 'video',
      title: 'Insulina: do pâncreas ao receptor',
      plan: {
        lead: 'A insulina abre a porta da glicose.',
        fixar: 'Receptor tirosina-cinase.',
        naProva: 'GLUT4 no músculo.',
        media: [],
      },
      status: 'generating',
      mediaStage: 'storyboard',
    })
    .returning();
  return { admin, batchId: b!.id, taskId: t!.id };
}

const task = async (id: string) =>
  (await owner.query.productionTasks.findFirst({ where: eq(s.productionTasks.id, id) }))!;
const assetsOf = (taskId: string, kind?: (typeof s.productionAssetKind.enumValues)[number]) =>
  owner
    .select()
    .from(s.productionAssets)
    .where(
      kind
        ? and(eq(s.productionAssets.taskId, taskId), eq(s.productionAssets.kind, kind))
        : eq(s.productionAssets.taskId, taskId),
    )
    .orderBy(asc(s.productionAssets.createdAt));
const setStage = (id: string, mediaStage: string) =>
  owner.update(s.productionTasks).set({ mediaStage }).where(eq(s.productionTasks.id, id));
const lastEvent = async (taskId: string) =>
  (
    await owner
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.topic, 'production.generate_media'),
          sql`${s.outbox.payload}->>'taskId' = ${taskId}`,
        ),
      )
      .orderBy(desc(s.outbox.id))
      .limit(1)
  )[0];
const spentToday = async () => {
  const r = await owner.execute<{ n: number }>(
    sql`select coalesce(sum(credits),0)::int as n from production_assets where created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
  );
  return Number(r.rows[0]!.n);
};
const setQuota = (dailyCredits: number) =>
  owner
    .insert(s.appSettings)
    .values({ key: MEDIA_SETTINGS_KEY, value: { voices: {}, dailyCredits } })
    .onConflictDoUpdate({
      target: s.appSettings.key,
      set: { value: { voices: {}, dailyCredits } },
    });

function deps(over: Partial<MediaDeps> = {}): MediaDeps {
  return {
    storage: store,
    storyboardWriter: new FakeStoryboardWriter(),
    media: new FakeMediaProvider(1),
    narrator: new FakeNarrator(),
    renderer: null,
    defaultVoice: 'voz-de-teste',
    defaultDailyCredits: 10_000,
    pollMs: 200,
    ...over,
  };
}

/** Roda o trabalho de mídia até a tarefa sair das etapas automáticas (como a fila faria). */
async function drive(d: MediaDeps, taskId: string, userId: string, max = 12) {
  const gen = productionGenerateMedia(d);
  for (let i = 0; i < max; i++) {
    await gen.run({ taskId, userId }, ctx());
    const t = await task(taskId);
    if (!['images', 'clips', 'narration', 'assembling'].includes(t.mediaStage ?? '')) return t;
  }
  return task(taskId);
}

describe('vídeo com narração (Fase 3)', () => {
  it('roteiro, imagens aprovadas, clipes, narração e montagem até o MP4', async () => {
    await setQuota(10_000);
    const { admin, batchId, taskId } = await videoTask();
    const d = deps({ renderer });
    const writer = d.storyboardWriter as FakeStoryboardWriter;

    await productionWriteStoryboard(d).run({ taskId, userId: admin }, ctx());
    let t = await task(taskId);
    expect(t.mediaStage).toBe('storyboard_review');
    expect((t.storyboard as { scenes: unknown[] }).scenes).toHaveLength(3);
    expect(writer.calls[0]!.instruction).toContain('insulina');
    // Nada pago antes da aprovação do roteiro.
    expect(await assetsOf(taskId)).toHaveLength(0);

    // Admin aprova o roteiro: imagens. A terceira cena usa a primeira como referência e espera.
    await setStage(taskId, 'images');
    const media = d.media as FakeMediaProvider;
    t = await drive(d, taskId, admin);
    expect(t.mediaStage).toBe('images_review');
    const images = await assetsOf(taskId, 'image');
    expect(images.map((a) => (a.meta as { scene: string }).scene)).toEqual([
      'abertura',
      'mecanismo',
      'fechamento',
    ]);
    expect(
      images.every((a) => a.storageKey && (a.meta as { status: string }).status === 'ready'),
    ).toBe(true);
    const imgSubmits = media.submitted.filter((x) => x.kind === 'image');
    expect(imgSubmits.map((x) => x.key)).toEqual(images.map((a) => a.id));
    expect(imgSubmits[2]!.refs).toHaveLength(1);
    expect(imgSubmits[0]!.refs).toHaveLength(0);
    // Consultas pendentes reagendam o trabalho para dali a pouco.
    expect(await lastEvent(taskId)).toBeTruthy();

    // Admin aprova as imagens: clipes, narração e montagem andam sozinhos.
    await setStage(taskId, 'clips');
    t = await drive(d, taskId, admin);
    expect(t.mediaStage).toBe('done');
    expect(t.status).toBe('generated');
    expect(t.currentVersion).toBe(1);
    const clips = await assetsOf(taskId, 'clip');
    expect(clips).toHaveLength(3);
    expect(media.submitted.filter((x) => x.kind === 'clip').map((x) => x.key)).toEqual(
      clips.map((a) => a.id),
    );
    const narrator = d.narrator as FakeNarrator;
    expect(narrator.calls).toHaveLength(1);
    expect(narrator.calls[0]!.voiceId).toBe('voz-de-teste');
    expect(narrator.calls[0]!.text).toContain('Cena 1 de teste');

    const [video] = await assetsOf(taskId, 'video');
    const body = await store.get(video!.storageKey!);
    const dir = mkdtempSync(path.join(tmpdir(), 'video-'));
    writeFileSync(path.join(dir, 'v.mp4'), body);
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,width,height:format=duration',
        '-of',
        'json',
        path.join(dir, 'v.mp4'),
      ]).toString(),
    ) as { streams: { codec_type: string; width?: number }[]; format: { duration: string } };
    expect(probe.streams.map((x) => x.codec_type).sort()).toEqual(['audio', 'video']);
    expect(probe.streams.find((x) => x.codec_type === 'video')!.width).toBe(1280);
    const audioMeta = (await assetsOf(taskId, 'audio'))[0]!.meta as {
      alignment: { character_end_times_seconds: number[] };
    };
    const spoken = audioMeta.alignment.character_end_times_seconds.at(-1)!;
    expect(Number(probe.format.duration)).toBeGreaterThan(spoken - 0.5);
    expect(Number(probe.format.duration)).toBeLessThan(spoken + 1.5);

    // A peça de vídeo é uma versão como as outras, com o marcador do endereço do vídeo.
    const [html] = await assetsOf(taskId, 'html');
    const blocks = JSON.parse((await store.get(html!.storageKey!)).toString()) as { body: string };
    expect(blocks.body).toContain('__COGNUSS_VIDEO_SRC__');
    expect((html!.meta as { video: string }).video).toBe(video!.id);
    // A peça passa no teste de render nos dois temas, com as capturas para o admin.
    expect(html!.meta).toMatchObject({ ok: true, tested: true, warnings: [] });
    expect(await assetsOf(taskId, 'screenshot')).toHaveLength(3);

    // Custo: 3 imagens e 3 clipes no lote; o lote termina a geração.
    const batch = await owner.query.productionBatches.findFirst({
      where: eq(s.productionBatches.id, batchId),
    });
    expect(batch!.actualCredits).toBe(3 * 2 + 3 * 14);
    expect(batch!.status).toBe('generated');
  }, 180_000);

  it('repetir o trabalho depois de uma queda não paga o mesmo pedido duas vezes', async () => {
    const { admin, taskId } = await videoTask();
    const d = deps();
    await productionWriteStoryboard(d).run({ taskId, userId: admin }, ctx());
    await setStage(taskId, 'images');
    // O provedor cai depois de receber o primeiro pedido, antes de o worker guardar o id.
    const media = new FakeMediaProvider(0);
    let fail = true;
    const flaky = Object.assign(Object.create(media) as FakeMediaProvider, {
      submitImage: async (input: Parameters<FakeMediaProvider['submitImage']>[0], key: string) => {
        const id = await media.submitImage(input, key);
        if (fail) {
          fail = false;
          throw new Error('conexão caiu');
        }
        return id;
      },
    });
    const gen = productionGenerateMedia(deps({ media: flaky }));
    await expect(gen.run({ taskId, userId: admin }, ctx())).rejects.toThrow('conexão caiu');
    expect((await task(taskId)).mediaLeaseUntil).toBeNull();
    const t = await drive(deps({ media: flaky }), taskId, admin);
    expect(t.mediaStage).toBe('images_review');
    const images = await assetsOf(taskId, 'image');
    expect(images).toHaveLength(3);
    // O primeiro pedido foi reenviado com a mesma chave (o provedor devolve o mesmo trabalho).
    const keysSent = media.submitted.map((x) => x.key);
    expect(keysSent[0]).toBe(keysSent[1]);
    expect(new Set(keysSent).size).toBe(3);
    expect(images.reduce((n, a) => n + a.credits, 0)).toBe(6);
  }, 60_000);

  it('cota do dia: para antes de pedir, avisa o admin e volta sozinho amanhã', async () => {
    const { admin, taskId } = await videoTask();
    const d = deps();
    await productionWriteStoryboard(d).run({ taskId, userId: admin }, ctx());
    await setStage(taskId, 'images');
    await setQuota((await spentToday()) + 3);
    await productionGenerateMedia(d).run({ taskId, userId: admin }, ctx());
    const t = await task(taskId);
    expect(t.mediaStage).toBe('images');
    expect(t.mediaAlert).toMatch(/cota de \d+ créditos de hoje acabou/);
    expect(await assetsOf(taskId, 'image')).toHaveLength(1);
    const ev = (await lastEvent(taskId))!;
    const hours = (new Date(ev.availableAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThanOrEqual(24.2);
    await setQuota(10_000);
  }, 60_000);

  it('saldo acabou: pausa com o motivo; fila cheia: espera o tempo pedido', async () => {
    const { admin, taskId } = await videoTask();
    await productionWriteStoryboard(deps()).run({ taskId, userId: admin }, ctx());
    await setStage(taskId, 'images');
    const busy = Object.assign(new FakeMediaProvider(), {
      submitImage: async () => {
        throw new MediaRetryLater('A fila da Higgsfield está cheia.', 90);
      },
    });
    await productionGenerateMedia(deps({ media: busy })).run({ taskId, userId: admin }, ctx());
    let t = await task(taskId);
    expect(t.mediaStage).toBe('images');
    expect(t.mediaAlert).toContain('fila da Higgsfield está cheia');
    const ev = (await lastEvent(taskId))!;
    expect(new Date(ev.availableAt).getTime() - Date.now()).toBeGreaterThan(60_000);

    const broke = Object.assign(new FakeMediaProvider(), {
      submitImage: async () => {
        throw new MediaBlocked(
          'Saldo insuficiente na Higgsfield. Adicione créditos e retome.',
          'balance',
        );
      },
    });
    await productionGenerateMedia(deps({ media: broke })).run({ taskId, userId: admin }, ctx());
    t = await task(taskId);
    expect(t.mediaStage).toBe('paused');
    expect(t.mediaResume).toBe('images');
    expect(t.mediaAlert).toContain('Saldo insuficiente');
  }, 60_000);

  it('sem chaves de mídia ou sem voz, pausa com o aviso claro', async () => {
    const { admin, taskId } = await videoTask();
    await productionWriteStoryboard(deps()).run({ taskId, userId: admin }, ctx());
    await setStage(taskId, 'images');
    await productionGenerateMedia(deps({ media: null })).run({ taskId, userId: admin }, ctx());
    expect((await task(taskId)).mediaAlert).toBe(MEDIA_MESSAGES.noProvider);

    await setStage(taskId, 'narration');
    await productionGenerateMedia(deps({ defaultVoice: null })).run(
      { taskId, userId: admin },
      ctx(),
    );
    const t = await task(taskId);
    expect(t.mediaStage).toBe('paused');
    expect(t.mediaAlert).toBe(MEDIA_MESSAGES.noVoice);
  }, 60_000);

  it('sem a chave do Claude, o roteiro falha com aviso', async () => {
    const { admin, taskId } = await videoTask();
    await productionWriteStoryboard(deps({ storyboardWriter: null })).run(
      { taskId, userId: admin },
      ctx(),
    );
    const t = await task(taskId);
    expect(t.status).toBe('failed');
    expect(t.lastError).toBe(MEDIA_MESSAGES.noWriter);
  });
});
