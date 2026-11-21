import {
  MediaBlocked,
  MediaRetryLater,
  type MediaProvider,
  type Narrator,
  type PiecePlan,
  type StoryboardWriter,
} from '@gutta/ai';
import {
  assemblePiece,
  buildAss,
  captionsFromAlignment,
  CLIP_SECONDS,
  fullNarration,
  MEDIA_AUTO_STAGES,
  MEDIA_CREDITS,
  pieceFoot,
  sceneLabels,
  sceneTimings,
  validateStoryboard,
  videoPieceBlocks,
  type Alignment,
  type MediaStage,
  type Storyboard,
} from '@gutta/core';
import { PIECE_FONT_CSS } from '@gutta/core/piece-fonts';
import { and, asc, eq, inArray, schema as s, sql, withUser, type Tx } from '@gutta/db';
import { emit } from '@gutta/jobs';
import { keys, type ObjectStorage } from '@gutta/storage';
import { assembleVideo, mediaSeconds, VIDEO_SIZE } from '../media/ffmpeg';
import type { PieceRenderer } from '../pieces/render';
import { failTask, settleBatch } from './pieces';
import type { Handler, JobContext } from './types';

// Mídia dos vídeos (docs/producao/ESPECIFICACAO.md, Fase 3; ADR 0021). Duas decisões do admin
// antes de gastar: aprovar o roteiro (nada pago ainda) e aprovar as imagens (antes de animar,
// que é o que custa). Depois disso o trabalho anda sozinho: clipes, narração e montagem.
//
// Regras de custo e cota:
// - Cada pedido pago nasce como registro em production_assets antes de ir ao provedor, e o id
//   do registro é a chave de idempotência: repetir o trabalho nunca cobra duas vezes.
// - Com o pedido enviado, só se consulta o status; nunca se reenvia.
// - A cota do dia (créditos) é conferida antes de cada pedido; acabou, o trabalho volta
//   sozinho no dia seguinte e o admin vê o aviso. Fila cheia no provedor: espera e tenta.
// - Saldo, chave ou pedido recusado pausam a tarefa com o motivo até o admin retomar.

export type MediaSettings = {
  /** Voz da ElevenLabs por disciplina (id da disciplina → id da voz). */
  voices: Record<string, string>;
  /** Créditos da Higgsfield por dia, somando todos os lotes. */
  dailyCredits: number;
};

export const MEDIA_SETTINGS_KEY = 'production_media';

export type MediaDeps = {
  storage: ObjectStorage | null;
  storyboardWriter: StoryboardWriter | null;
  media: MediaProvider | null;
  narrator: Narrator | null;
  renderer?: PieceRenderer | null;
  /** Voz e cota quando o admin ainda não configurou (variáveis do worker). */
  defaultVoice?: string | null;
  defaultDailyCredits?: number;
  /** Intervalo entre consultas ao provedor. */
  pollMs?: number;
};

export const MEDIA_MESSAGES = {
  noWriter:
    'O roteiro do vídeo não está disponível (falta a chave do Claude). Gere de novo quando a chave estiver configurada.',
  refused: 'A IA recusou escrever este roteiro. Revise o pedido e gere de novo.',
  noProvider:
    'A geração de imagens e clipes não está configurada (faltam as chaves da Higgsfield no worker). Retome depois de configurar.',
  noNarrator:
    'A narração não está configurada (falta a chave da ElevenLabs no worker). Retome depois de configurar.',
  noVoice:
    'Esta disciplina ainda não tem voz de narração. Escolha a voz em Produção · Vozes e retome.',
  quota: (limit: number) =>
    `A cota de ${limit} créditos de hoje acabou. A geração continua sozinha amanhã, a partir da meia-noite.`,
  dead: 'A mídia parou por um erro inesperado. Retome para tentar de novo.',
} as const;

type TaskRow = typeof s.productionTasks.$inferSelect;
type AssetRow = typeof s.productionAssets.$inferSelect;
type AssetMeta = {
  scene?: string;
  prompt?: string;
  status?: 'submitting' | 'pending' | 'ready' | 'failed';
  error?: string;
  superseded?: boolean;
  [k: string]: unknown;
};

const SHOT_NAMES: Record<string, string> = {
  'light-desktop': 'claro',
  'dark-desktop': 'escuro',
  'light-mobile': 'celular',
};

const metaOf = (a: AssetRow) => a.meta as AssetMeta;

/** Último pedido válido de cada cena (os substituídos pelo admin ficam no histórico). */
function latestByScene(assets: AssetRow[], kind: 'image' | 'clip') {
  const out = new Map<string, AssetRow>();
  for (const a of assets) {
    const m = metaOf(a);
    if (a.kind !== kind || !m.scene || m.superseded) continue;
    const cur = out.get(m.scene);
    if (!cur || a.version > cur.version) out.set(m.scene, a);
  }
  return out;
}

export async function mediaSettings(tx: Tx, deps: MediaDeps): Promise<MediaSettings> {
  const row = await tx.query.appSettings.findFirst({
    where: eq(s.appSettings.key, MEDIA_SETTINGS_KEY),
  });
  const v = (row?.value ?? {}) as Partial<MediaSettings>;
  return {
    voices: v.voices ?? {},
    dailyCredits: v.dailyCredits ?? deps.defaultDailyCredits ?? 300,
  };
}

/** Créditos de mídia gastos hoje (dia de Brasília), em todos os lotes. */
async function creditsToday(tx: Tx) {
  const [r] = await tx
    .select({ n: sql<number>`coalesce(sum(${s.productionAssets.credits}), 0)::int` })
    .from(s.productionAssets)
    .where(
      sql`${s.productionAssets.createdAt} >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
    );
  return r?.n ?? 0;
}

/** Até a meia-noite de Brasília, mais cinco minutos de folga. */
async function msUntilTomorrow(tx: Tx) {
  const r = await tx.execute<{ s: number }>(
    sql`select extract(epoch from ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day 5 minutes') at time zone 'America/Sao_Paulo') - now())::float as s`,
  );
  return Math.max(60_000, Math.round(Number(r.rows[0]?.s ?? 3600) * 1000));
}

class QuotaReached extends Error {
  constructor(readonly limit: number) {
    super('cota do dia');
  }
}

type StepResult =
  | { kind: 'continue' } // a etapa mudou: seguir na mesma execução
  | { kind: 'wait'; ms: number; alert?: string | null } // consultar de novo depois
  | { kind: 'stop' }; // espera o admin

export function productionWriteStoryboard(deps: MediaDeps): Handler<'production.write_storyboard'> {
  return {
    run: async ({ taskId, userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      const loaded = await inTx(async (tx) => {
        const task = await tx.query.productionTasks.findFirst({
          where: eq(s.productionTasks.id, taskId),
        });
        if (!task || task.status !== 'generating' || task.mediaStage !== 'storyboard') return null;
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
      if (!deps.storyboardWriter)
        return void (await inTx((tx) => failTask(tx, taskId, batch.id, MEDIA_MESSAGES.noWriter)));
      const storage = deps.storage;
      const res = await deps.storyboardWriter.write({
        discipline: loaded.discipline?.name ?? 'Disciplina',
        lesson: batch.title,
        title: task.title,
        instruction: task.instruction,
        plan: (task.plan as PiecePlan | null) ?? null,
        note: task.pendingNote,
        slides: await Promise.all(
          slides.map(async (x) => ({
            number: x.number,
            text: x.text,
            image:
              x.hasImage && storage
                ? await storage.get(keys.productionSlide(batch.id, x.number))
                : null,
          })),
        ),
      });
      await inTx(async (tx) => {
        await tx.insert(s.aiUsage).values({
          ownerId: userId,
          feature: 'producao_roteiro',
          model: res.model,
          inputTokens: res.usage.input,
          outputTokens: res.usage.output,
          cacheReadTokens: res.usage.cacheRead,
          cacheWriteTokens: res.usage.cacheWrite,
          costMicros: res.costMicros,
          refused: res.refused,
        });
        if (res.refused) return failTask(tx, taskId, batch.id, MEDIA_MESSAGES.refused);
        const problems = validateStoryboard(res.storyboard);
        await tx
          .update(s.productionTasks)
          .set({
            storyboard: res.storyboard as unknown as Record<string, unknown>,
            mediaStage: 'storyboard_review',
            mediaAlert: null,
            pendingNote: null,
            lastError: problems.length ? problems.join('\n') : null,
          })
          .where(
            and(eq(s.productionTasks.id, taskId), eq(s.productionTasks.mediaStage, 'storyboard')),
          );
      });
      ctx.log.info('production.storyboard', { taskId, scenes: res.storyboard.scenes.length });
    },
    onDead: async ({ taskId, userId }, ctx) => {
      await withUser(ctx.db, userId, async (tx) => {
        const task = await tx.query.productionTasks.findFirst({
          where: eq(s.productionTasks.id, taskId),
        });
        if (task) await failTask(tx, taskId, task.batchId, MEDIA_MESSAGES.dead);
      });
    },
  };
}

export function productionGenerateMedia(deps: MediaDeps): Handler<'production.generate_media'> {
  const pollMs = deps.pollMs ?? 20_000;
  return {
    run: async ({ taskId, userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      // Um trabalho por tarefa: quem pega a vez marca a tarefa; o outro volta daqui a pouco.
      const lease = await inTx(async (tx) => {
        const [task] = await tx
          .update(s.productionTasks)
          .set({ mediaLeaseUntil: sql`now() + interval '20 minutes'` })
          .where(
            and(
              eq(s.productionTasks.id, taskId),
              eq(s.productionTasks.status, 'generating'),
              inArray(s.productionTasks.mediaStage, [...MEDIA_AUTO_STAGES]),
              sql`(${s.productionTasks.mediaLeaseUntil} is null or ${s.productionTasks.mediaLeaseUntil} < now())`,
            ),
          )
          .returning();
        if (task) return task;
        const busy = await tx.query.productionTasks.findFirst({
          where: and(
            eq(s.productionTasks.id, taskId),
            eq(s.productionTasks.status, 'generating'),
            inArray(s.productionTasks.mediaStage, [...MEDIA_AUTO_STAGES]),
          ),
        });
        if (busy)
          await emit(tx, 'production.generate_media', { taskId, userId }, { delayMs: 30_000 });
        return null;
      });
      if (!lease) return;
      let next: StepResult = { kind: 'stop' };
      try {
        for (let guard = 0; guard < 8; guard++) {
          const task = await inTx((tx) =>
            tx.query.productionTasks.findFirst({ where: eq(s.productionTasks.id, taskId) }),
          );
          if (!task || task.status !== 'generating') break;
          next = await advance(task, userId, ctx, deps, pollMs);
          if (next.kind !== 'continue') break;
        }
      } finally {
        await inTx(async (tx) => {
          const patch: Partial<TaskRow> = { mediaLeaseUntil: null };
          if (next.kind === 'wait' && next.alert !== undefined) patch.mediaAlert = next.alert;
          await tx.update(s.productionTasks).set(patch).where(eq(s.productionTasks.id, taskId));
          if (next.kind === 'wait')
            await emit(tx, 'production.generate_media', { taskId, userId }, { delayMs: next.ms });
        });
      }
    },
    onDead: async ({ taskId, userId }, ctx) => {
      await withUser(ctx.db, userId, (tx) => pause(tx, taskId, MEDIA_MESSAGES.dead));
    },
  };
}

async function pause(tx: Tx, taskId: string, alert: string) {
  const task = await tx.query.productionTasks.findFirst({
    where: eq(s.productionTasks.id, taskId),
  });
  if (!task || task.status !== 'generating' || task.mediaStage === 'paused') return;
  await tx
    .update(s.productionTasks)
    .set({
      mediaStage: 'paused',
      mediaResume: task.mediaStage,
      mediaAlert: alert,
      mediaLeaseUntil: null,
    })
    .where(eq(s.productionTasks.id, taskId));
}

async function setStage(tx: Tx, taskId: string, stage: MediaStage, extra: Partial<TaskRow> = {}) {
  await tx
    .update(s.productionTasks)
    .set({ mediaStage: stage, mediaAlert: null, ...extra })
    .where(eq(s.productionTasks.id, taskId));
}

async function advance(
  task: TaskRow,
  userId: string,
  ctx: JobContext,
  deps: MediaDeps,
  pollMs: number,
): Promise<StepResult> {
  const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
  const stage = task.mediaStage as MediaStage;
  if (!MEDIA_AUTO_STAGES.includes(stage)) return { kind: 'stop' };
  if (!deps.storage) throw new Error('armazenamento não configurado');
  const storage = deps.storage;
  const sb = task.storyboard as unknown as Storyboard;
  const batch = (await inTx((tx) =>
    tx.query.productionBatches.findFirst({ where: eq(s.productionBatches.id, task.batchId) }),
  ))!;
  const assets = await inTx((tx) =>
    tx
      .select()
      .from(s.productionAssets)
      .where(eq(s.productionAssets.taskId, task.id))
      .orderBy(asc(s.productionAssets.version)),
  );
  const stop = async (alert: string) => {
    await inTx((tx) => pause(tx, task.id, alert));
    return { kind: 'stop' } as const;
  };

  try {
    if (stage === 'images' || stage === 'clips') {
      if (!deps.media) return await stop(MEDIA_MESSAGES.noProvider);
      const media = deps.media;
      const kind = stage === 'images' ? 'image' : 'clip';
      const images = latestByScene(assets, 'image');
      const mine = latestByScene(assets, kind);
      let pending = 0;
      const failed: string[] = [];
      for (const scene of sb.scenes) {
        let a = mine.get(scene.id);
        if (!a) {
          // Imagem com referência espera a imagem da cena de referência ficar pronta.
          const refImage = scene.referenceScene ? images.get(scene.referenceScene) : undefined;
          if (kind === 'image' && scene.referenceScene && !refImage?.storageKey) {
            if (refImage && metaOf(refImage).status === 'failed')
              failed.push(`${scene.id}: a imagem de referência (${scene.referenceScene}) falhou`);
            else pending++;
            continue;
          }
          const first = images.get(scene.id);
          if (kind === 'clip' && !first?.storageKey)
            return await stop(`A cena "${scene.id}" está sem imagem aprovada. Refaça a imagem.`);
          const credits = MEDIA_CREDITS[kind];
          a = await inTx(async (tx) => {
            const st = await mediaSettings(tx, deps);
            if ((await creditsToday(tx)) + credits > st.dailyCredits)
              throw new QuotaReached(st.dailyCredits);
            const version =
              assets.filter((x) => x.kind === kind && metaOf(x).scene === scene.id).length + 1;
            const [row] = await tx
              .insert(s.productionAssets)
              .values({
                batchId: task.batchId,
                taskId: task.id,
                kind,
                version,
                provider: media.name,
                credits,
                meta: {
                  scene: scene.id,
                  prompt: kind === 'image' ? scene.imagePrompt : scene.motionPrompt,
                  status: 'submitting',
                  reference: refImage?.id ?? null,
                },
              })
              .returning();
            await tx
              .update(s.productionBatches)
              .set({ actualCredits: sql`${s.productionBatches.actualCredits} + ${credits}` })
              .where(eq(s.productionBatches.id, task.batchId));
            return row!;
          });
          assets.push(a);
        }
        const m = metaOf(a);
        if (m.status === 'ready' || m.status === 'failed') {
          if (m.status === 'failed') failed.push(`${scene.id}: ${m.error ?? 'falhou'}`);
          continue;
        }
        if (!a.externalJobId) {
          // Primeiro envio, ou o anterior caiu antes de guardar o id: a mesma chave de
          // idempotência faz o provedor devolver o mesmo pedido, sem cobrar de novo.
          let requestId: string;
          if (kind === 'image') {
            const ref = m.reference ? assets.find((x) => x.id === m.reference) : undefined;
            const refUrl = ref?.storageKey
              ? await media.uploadImage(await storage.get(ref.storageKey), 'image/jpeg')
              : null;
            requestId = await media.submitImage(
              {
                prompt: String(m.prompt),
                referenceUrls: refUrl ? [refUrl] : [],
                aspectRatio: '16:9',
              },
              a.id,
            );
          } else {
            const img = images.get(scene.id)!;
            const url = await media.uploadImage(await storage.get(img.storageKey!), 'image/jpeg');
            requestId = await media.submitClip(
              { prompt: String(m.prompt), imageUrl: url, seconds: CLIP_SECONDS },
              a.id,
            );
          }
          a = await updateAsset(
            inTx,
            assets,
            a,
            { externalJobId: requestId },
            { status: 'pending' },
          );
          pending++;
          continue;
        }
        const st = await media.check(a.externalJobId);
        if (st.status === 'pending') {
          pending++;
          continue;
        }
        if (st.status === 'failed') {
          await updateAsset(inTx, assets, a, {}, { status: 'failed', error: st.error });
          failed.push(`${scene.id}: ${st.error}`);
          continue;
        }
        const body = await media.download(st.url);
        const ext = kind === 'image' ? 'jpg' : 'mp4';
        const key = keys.productionMedia(task.batchId, task.id, a.id, ext);
        await storage.put(key, body, kind === 'image' ? 'image/jpeg' : 'video/mp4');
        a = await updateAsset(
          inTx,
          assets,
          a,
          { storageKey: key },
          { status: 'ready', bytes: body.length },
        );
        if (kind === 'image') images.set(scene.id, a);
      }
      if (pending) return { kind: 'wait', ms: pollMs, alert: null };
      if (kind === 'image') {
        // Prontas (ou com falha para refazer): o admin confere antes de animar.
        await inTx((tx) =>
          setStage(tx, task.id, 'images_review', {
            lastError: failed.length ? `Imagens com falha:\n${failed.join('\n')}` : null,
          }),
        );
        return { kind: 'stop' };
      }
      if (failed.length) return await stop(`Clipes com falha:\n${failed.join('\n')}`);
      await inTx((tx) => setStage(tx, task.id, 'narration', { lastError: null }));
      return { kind: 'continue' };
    }

    if (stage === 'narration') {
      if (!deps.narrator) return await stop(MEDIA_MESSAGES.noNarrator);
      const voice = await inTx(async (tx) => {
        const st = await mediaSettings(tx, deps);
        return st.voices[batch.disciplineId] ?? deps.defaultVoice ?? null;
      });
      if (!voice) return await stop(MEDIA_MESSAGES.noVoice);
      const text = fullNarration(sb);
      const n = await deps.narrator.narrate(text, voice);
      await inTx(async (tx) => {
        const version = assets.filter((x) => x.kind === 'audio').length + 1;
        const [row] = await tx
          .insert(s.productionAssets)
          .values({
            batchId: task.batchId,
            taskId: task.id,
            kind: 'audio',
            version,
            provider: deps.narrator!.name,
            meta: { voice, characters: n.characters, alignment: n.alignment, status: 'ready' },
          })
          .returning();
        const key = keys.productionMedia(task.batchId, task.id, row!.id, 'mp3');
        await storage.put(key, n.audio, 'audio/mpeg');
        await tx
          .update(s.productionAssets)
          .set({ storageKey: key })
          .where(eq(s.productionAssets.id, row!.id));
        await setStage(tx, task.id, 'assembling');
      });
      return { kind: 'continue' };
    }

    // Montagem: clipes no tempo da fala de cada cena, narração, legenda e rótulos.
    const clips = latestByScene(assets, 'clip');
    const audio = assets
      .filter((x) => x.kind === 'audio' && x.storageKey && !metaOf(x).superseded)
      .at(-1);
    if (!audio) {
      await inTx((tx) => setStage(tx, task.id, 'narration'));
      return { kind: 'continue' };
    }
    const audioBody = await storage.get(audio.storageKey!);
    const alignment = metaOf(audio).alignment as Alignment;
    const seconds = await mediaSeconds(audioBody, 'mp3');
    const timings = sceneTimings(sb, alignment, seconds);
    const clipInputs = [];
    for (const [i, scene] of sb.scenes.entries()) {
      const c = clips.get(scene.id);
      if (!c?.storageKey) {
        await inTx((tx) => setStage(tx, task.id, 'clips'));
        return { kind: 'continue' };
      }
      clipInputs.push({
        body: await storage.get(c.storageKey),
        seconds: timings[i]!.end - timings[i]!.start,
      });
    }
    const ass = buildAss({
      ...VIDEO_SIZE,
      captions: captionsFromAlignment(alignment),
      labels: sceneLabels(sb, timings),
    });
    const video = await assembleVideo({ clips: clipInputs, audio: audioBody, ass });
    const discipline = await inTx((tx) =>
      tx.query.disciplines.findFirst({ where: eq(s.disciplines.id, batch.disciplineId) }),
    );
    const plan = (task.plan as PiecePlan | null) ?? null;
    const blocks = videoPieceBlocks({
      title: task.title,
      theme: discipline?.name ?? 'Vídeo',
      lead: plan?.lead ?? sb.scenes[0]?.narration ?? '',
      fixar: plan?.fixar ?? '',
      naProva: plan?.naProva ?? '',
      storyboard: sb,
    });
    const version = (task.currentVersion ?? 0) + 1;
    const videoRow = await inTx(async (tx) => {
      const [row] = await tx
        .insert(s.productionAssets)
        .values({
          batchId: task.batchId,
          taskId: task.id,
          kind: 'video',
          version,
          provider: 'ffmpeg',
          meta: { seconds, scenes: timings, audio: audio.id, status: 'ready' },
        })
        .returning();
      return row!;
    });
    const videoKey = keys.productionMedia(task.batchId, task.id, videoRow.id, 'mp4');
    await storage.put(videoKey, video, 'video/mp4');
    const pieceKey = keys.productionPiece(task.batchId, task.id, version);
    await storage.put(pieceKey, Buffer.from(JSON.stringify(blocks)), 'application/json');
    // Teste de render da peça (sem o vídeo, que o teste não carrega): capturas para o admin.
    const report = deps.renderer
      ? await deps.renderer.test(
          assemblePiece(blocks, {
            crumb: `${discipline?.name ?? 'Disciplina'} · ${batch.title}`,
            foot: pieceFoot(batch.bibliography),
            demo: true,
            fontCss: PIECE_FONT_CSS,
          }),
        )
      : null;
    const shots: { key: string; name: string }[] = [];
    for (const c of report?.checks ?? []) {
      const name = SHOT_NAMES[`${c.theme}-${c.viewport}`];
      if (!name || !c.screenshot.length) continue;
      const key = keys.productionShot(task.batchId, task.id, version, name);
      await storage.put(key, c.screenshot, 'image/jpeg');
      shots.push({ key, name });
    }
    await inTx(async (tx) => {
      await tx
        .update(s.productionAssets)
        .set({ storageKey: videoKey, meta: { ...metaOf(videoRow), bytes: video.length } })
        .where(eq(s.productionAssets.id, videoRow.id));
      await tx.insert(s.productionAssets).values({
        batchId: task.batchId,
        taskId: task.id,
        kind: 'html',
        version,
        provider: 'ffmpeg',
        storageKey: pieceKey,
        meta: {
          attempt: 1,
          ok: true,
          video: videoRow.id,
          problems: [],
          warnings: [...(report?.problems ?? []), ...(report?.warnings ?? [])],
          tested: Boolean(report),
        },
      });
      if (shots.length)
        await tx.insert(s.productionAssets).values(
          shots.map((x) => ({
            batchId: task.batchId,
            taskId: task.id,
            kind: 'screenshot' as const,
            version,
            provider: 'playwright',
            storageKey: x.key,
            meta: { view: x.name },
          })),
        );
      await tx
        .update(s.productionTasks)
        .set({
          status: 'generated',
          mediaStage: 'done',
          mediaAlert: null,
          currentVersion: version,
          lastError: null,
          pendingNote: null,
        })
        .where(eq(s.productionTasks.id, task.id));
      await settleBatch(tx, task.batchId);
    });
    ctx.log.info('production.video', { taskId: task.id, version, seconds, bytes: video.length });
    return { kind: 'stop' };
  } catch (e) {
    if (e instanceof QuotaReached) {
      const ms = await inTx((tx) => msUntilTomorrow(tx));
      return { kind: 'wait', ms, alert: MEDIA_MESSAGES.quota(e.limit) };
    }
    if (e instanceof MediaRetryLater)
      return {
        kind: 'wait',
        ms: e.retryAfterSeconds * 1000,
        alert: `${e.message} Tentando de novo em instantes.`,
      };
    if (e instanceof MediaBlocked) return await stop(e.message);
    throw e;
  }
}

async function updateAsset(
  inTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
  all: AssetRow[],
  a: AssetRow,
  cols: Partial<Pick<AssetRow, 'externalJobId' | 'storageKey'>>,
  meta: Partial<AssetMeta>,
): Promise<AssetRow> {
  const merged = { ...metaOf(a), ...meta };
  const [row] = await inTx((tx) =>
    tx
      .update(s.productionAssets)
      .set({ ...cols, meta: merged })
      .where(eq(s.productionAssets.id, a.id))
      .returning(),
  );
  // A lista da etapa fica em dia: a referência de uma cena pode ter ficado pronta agora.
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = row!;
  return row!;
}
