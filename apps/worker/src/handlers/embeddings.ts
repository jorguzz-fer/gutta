import {
  chunkPages,
  EmbedderUnavailable,
  embeddingCostMicros,
  type Chunk,
  type Embedder,
} from '@gutta/ai';
import {
  aiFeatureOn,
  and,
  asc,
  coversVectors,
  desc,
  eq,
  inArray,
  notInArray,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { emit } from '@gutta/jobs';
import type { Handler } from './types';

// Vetores da busca por conceito (ADR 0014; SPEC v2, MAT-09). Um trabalho por aluno: gera os
// trechos da versão atual de cada material que ainda não tem, e apaga os que não valem mais
// (versão antiga, material na lixeira, autorização retirada). Repetir não faz mal.

export type EmbedDeps = {
  embedder: Embedder | null;
  /** Recurso ligado pelo admin (7.7); trocável nos testes. */
  featureOn?: typeof aiFeatureOn;
};

/** Versões por volta; o resto vai num trabalho seguinte, para não segurar a fila. */
export const VERSIONS_PER_RUN = 10;

type Pending = { materialId: string; versionId: string; fileId: string };

async function plan(tx: Tx, userId: string) {
  const current = await tx
    .selectDistinctOn([s.materialVersions.materialId], {
      materialId: s.materialVersions.materialId,
      versionId: s.materialVersions.id,
      fileId: s.materialVersions.fileId,
      status: s.files.status,
    })
    .from(s.materialVersions)
    .innerJoin(s.materials, eq(s.materials.id, s.materialVersions.materialId))
    .innerJoin(s.files, eq(s.files.id, s.materialVersions.fileId))
    .where(and(eq(s.materialVersions.ownerId, userId), sql`${s.materials.deletedAt} is null`))
    .orderBy(s.materialVersions.materialId, desc(s.materialVersions.version));
  const keep = current.map((c) => c.versionId);
  // Trechos de versão antiga ou de material na lixeira saem.
  await tx
    .delete(s.materialChunks)
    .where(
      and(
        eq(s.materialChunks.ownerId, userId),
        keep.length ? notInArray(s.materialChunks.versionId, keep) : undefined,
      ),
    );
  const done = keep.length
    ? await tx
        .selectDistinct({ versionId: s.materialChunks.versionId })
        .from(s.materialChunks)
        .where(and(eq(s.materialChunks.ownerId, userId), inArray(s.materialChunks.versionId, keep)))
    : [];
  const doneSet = new Set(done.map((d) => d.versionId));
  return current
    .filter((c) => c.status === 'ready' && !doneSet.has(c.versionId))
    .map(({ materialId, versionId, fileId }) => ({ materialId, versionId, fileId }));
}

export function embedUser(deps: EmbedDeps): Handler<'ai.embed_user'> {
  return {
    run: async ({ userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      const featureOn = deps.featureOn ?? aiFeatureOn;

      const allowed = await inTx(async (tx) => {
        const [c] = await tx
          .select({ granted: s.consentRecords.granted, version: s.consentRecords.policyVersion })
          .from(s.consentRecords)
          .where(
            and(eq(s.consentRecords.userId, userId), eq(s.consentRecords.purpose, 'ai_materials')),
          )
          .orderBy(desc(s.consentRecords.recordedAt))
          .limit(1);
        if (!coversVectors(c)) {
          // Sem a autorização que cita a Voyage: nenhum vetor do aluno fica guardado (LGPD).
          await tx.delete(s.materialChunks).where(eq(s.materialChunks.ownerId, userId));
          return false;
        }
        return featureOn(tx, 'busca_conceito');
      });
      if (!allowed || !deps.embedder) return;

      const pending = await inTx((tx) => plan(tx, userId));
      for (const p of pending.slice(0, VERSIONS_PER_RUN)) await embedVersion(deps.embedder, p);
      if (pending.length > VERSIONS_PER_RUN)
        await inTx((tx) => emit(tx, 'ai.embed_user', { userId }, { delayMs: 1000 }));

      async function embedVersion(embedder: Embedder, p: Pending) {
        const pages = await inTx((tx) =>
          tx
            .select({ page: s.filePages.page, text: s.filePages.text })
            .from(s.filePages)
            .where(and(eq(s.filePages.fileId, p.fileId), eq(s.filePages.ownerId, userId)))
            .orderBy(asc(s.filePages.page)),
        );
        const chunks: Chunk[] = chunkPages(pages);
        if (!chunks.length) return;
        let result;
        try {
          result = await embedder.embed(
            chunks.map((c) => c.text),
            'document',
          );
        } catch (err) {
          // Chave errada não melhora repetindo; limite de taxa e queda tentam de novo.
          if (err instanceof EmbedderUnavailable && !err.retryable) {
            ctx.log.error('ai.embed_failed', { reason: err.message });
            return;
          }
          throw err;
        }
        await inTx(async (tx) => {
          // O material pode ter ganhado versão nova enquanto os vetores eram gerados.
          const still = await tx.query.materialVersions.findFirst({
            where: and(
              eq(s.materialVersions.id, p.versionId),
              eq(s.materialVersions.ownerId, userId),
            ),
          });
          if (!still) return;
          await tx
            .insert(s.materialChunks)
            .values(
              chunks.map((c, i) => ({
                ownerId: userId,
                materialId: p.materialId,
                versionId: p.versionId,
                position: c.position,
                pageFrom: c.pageFrom,
                pageTo: c.pageTo,
                text: c.text,
                embedding: result.vectors[i]!,
                model: result.model,
              })),
            )
            .onConflictDoNothing();
          await tx.insert(s.aiUsage).values({
            ownerId: userId,
            feature: 'embedding',
            model: result.model,
            inputTokens: result.tokens,
            costMicros: embeddingCostMicros(result.model, result.tokens),
          });
        });
        ctx.log.info('ai.embedded', { versionId: p.versionId, chunks: chunks.length });
      }
    },
  };
}
