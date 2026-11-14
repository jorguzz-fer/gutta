import { createHash, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeEmbedder } from '@gutta/ai';
import { eq, schema as s } from '@gutta/db';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import { embedUser } from '../src/handlers/embeddings';
import type { JobContext } from '../src/handlers/types';
import { logger } from '../src/logger';

// Vetores da busca por conceito (ADR 0014; plano, item 66).
const { app, owner, appPool, ownerPool } = connect();
const ctx = (): JobContext => ({ db: app, log: logger, jobId: 'teste', attempt: 1 });
const on = async () => true;

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

async function file(userId: string, pages: string[]) {
  const body = randomBytes(16);
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: userId,
      originalName: 'slides.pdf',
      mime: 'application/pdf',
      sizeBytes: 16,
      sha256: createHash('sha256').update(body).digest('hex'),
      status: 'ready',
    })
    .returning();
  await owner
    .insert(s.filePages)
    .values(pages.map((text, i) => ({ fileId: f!.id, ownerId: userId, page: i + 1, text })));
  return f!.id;
}

async function scenario(version = '2026-11-14-rascunho') {
  const userId = await makeUser(owner);
  await owner
    .insert(s.consentRecords)
    .values({ userId, purpose: 'ai_materials', granted: true, policyVersion: version });
  const [m] = await owner
    .insert(s.materials)
    .values({ ownerId: userId, title: 'Slides de inflamação' })
    .returning();
  const [v] = await owner
    .insert(s.materialVersions)
    .values({
      ownerId: userId,
      materialId: m!.id,
      fileId: await file(userId, ['Leucócitos migram para o tecido.', 'Fase crônica: macrófagos.']),
      version: 1,
    })
    .returning();
  return { userId, materialId: m!.id, versionId: v!.id };
}

const chunksOf = (userId: string) =>
  owner.select().from(s.materialChunks).where(eq(s.materialChunks.ownerId, userId));

describe('vetores dos materiais', () => {
  it('gera os trechos da versão atual com as páginas, uma vez só, e registra o uso', async () => {
    const x = await scenario();
    const job = embedUser({ embedder: new FakeEmbedder(), featureOn: on });
    await job.run({ userId: x.userId }, ctx());
    const chunks = await chunksOf(x.userId);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ versionId: x.versionId, pageFrom: 1, pageTo: 2 });
    expect(chunks[0]!.embedding).toHaveLength(1024);
    await job.run({ userId: x.userId }, ctx());
    expect(await chunksOf(x.userId)).toHaveLength(1);
    const usage = await owner.select().from(s.aiUsage).where(eq(s.aiUsage.ownerId, x.userId));
    expect(usage.map((u) => u.feature)).toEqual(['embedding']);
  });

  it('versão nova troca os trechos; material na lixeira perde os seus', async () => {
    const x = await scenario();
    const job = embedUser({ embedder: new FakeEmbedder(), featureOn: on });
    await job.run({ userId: x.userId }, ctx());
    const [v2] = await owner
      .insert(s.materialVersions)
      .values({
        ownerId: x.userId,
        materialId: x.materialId,
        fileId: await file(x.userId, ['Versão nova dos slides.']),
        version: 2,
      })
      .returning();
    await job.run({ userId: x.userId }, ctx());
    expect((await chunksOf(x.userId)).map((c) => c.versionId)).toEqual([v2!.id]);
    await owner
      .update(s.materials)
      .set({ deletedAt: new Date() })
      .where(eq(s.materials.id, x.materialId));
    await job.run({ userId: x.userId }, ctx());
    expect(await chunksOf(x.userId)).toEqual([]);
  });

  it('sem a autorização que cita a Voyage, nada é gerado e o que havia sai', async () => {
    const x = await scenario();
    await embedUser({ embedder: new FakeEmbedder(), featureOn: on }).run(
      { userId: x.userId },
      ctx(),
    );
    expect(await chunksOf(x.userId)).toHaveLength(1);
    // Autorização antiga (antes da Voyage) volta a ser a mais recente.
    await owner.insert(s.consentRecords).values({
      userId: x.userId,
      purpose: 'ai_materials',
      granted: true,
      policyVersion: '2026-11-03-rascunho',
    });
    await embedUser({ embedder: new FakeEmbedder(), featureOn: on }).run(
      { userId: x.userId },
      ctx(),
    );
    expect(await chunksOf(x.userId)).toEqual([]);
  });

  it('recurso pausado pelo admin ou sem chave: nada é gerado', async () => {
    const x = await scenario();
    await embedUser({ embedder: new FakeEmbedder(), featureOn: async () => false }).run(
      { userId: x.userId },
      ctx(),
    );
    await embedUser({ embedder: null, featureOn: on }).run({ userId: x.userId }, ctx());
    expect(await chunksOf(x.userId)).toEqual([]);
  });
});
