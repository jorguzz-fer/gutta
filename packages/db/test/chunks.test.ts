import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Trechos com vetores da busca por conceito (ADR 0014; plano, item 66): só do dono.
const { app, owner, appPool, ownerPool } = connect();
const vec = (x: number) =>
  Array.from({ length: s.EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? x : 0));

let ana: string;
let beto: string;
let mat: { materialId: string; versionId: string };

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  mat = await withUser(app, ana, async (tx) => {
    const [f] = await tx
      .insert(s.files)
      .values({
        ownerId: ana,
        originalName: 'slides.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        sha256: randomBytes(32).toString('hex'),
        status: 'ready',
      })
      .returning();
    const [m] = await tx.insert(s.materials).values({ ownerId: ana, title: 'Slides' }).returning();
    const [v] = await tx
      .insert(s.materialVersions)
      .values({ ownerId: ana, materialId: m!.id, fileId: f!.id, version: 1 })
      .returning();
    await tx.insert(s.materialChunks).values({
      ownerId: ana,
      materialId: m!.id,
      versionId: v!.id,
      position: 0,
      pageFrom: 1,
      pageTo: 1,
      text: 'Leucócitos',
      embedding: vec(1),
      model: 'teste',
    });
    return { materialId: m!.id, versionId: v!.id };
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('busca por conceito: isolamento', () => {
  it('outro aluno não lê os trechos nem grava trecho no material de outro', async () => {
    expect(await withUser(app, beto, (tx) => tx.select().from(s.materialChunks))).toEqual([]);
    const err = await withUser(app, beto, (tx) =>
      tx.insert(s.materialChunks).values({
        ownerId: beto,
        materialId: mat.materialId,
        versionId: mat.versionId,
        position: 1,
        pageFrom: 1,
        pageTo: 1,
        text: 'x',
        embedding: vec(1),
        model: 'teste',
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    expect(await withUser(app, ana, (tx) => tx.select().from(s.materialChunks))).toHaveLength(1);
  });
});
