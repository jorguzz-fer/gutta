import { randomBytes, randomUUID } from 'node:crypto';
import { FakeEmbedder, chunkPages } from '@gutta/ai';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as materials from '@/features/materials/service';
import { setConsent } from '@/features/privacy/service';

// Busca por conceito (ADR 0014; plano, item 66): com o provedor de teste, "glóbulos brancos"
// acha a página de "leucócitos", que a busca por palavra não acha. Só do próprio aluno.
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

/** Aluno com um material e os trechos já gerados (o worker faz isso; testado lá). */
async function student(pages: string[]) {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  const [t] = await owner
    .insert(s.studentTerms)
    .values({ ownerId: id, label: 'Atual' })
    .returning();
  const [d] = await owner
    .insert(s.enrolledDisciplines)
    .values({ ownerId: id, termId: t!.id, name: 'Patologia', color: 1 })
    .returning();
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: id,
      originalName: 'slides.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      sha256: randomBytes(32).toString('hex'),
      status: 'ready',
      pageCount: pages.length,
    })
    .returning();
  await owner
    .insert(s.filePages)
    .values(pages.map((text, i) => ({ fileId: f!.id, ownerId: id, page: i + 1, text })));
  const { material } = await materials.createMaterial(id, {
    fileId: f!.id,
    title: 'Slides de imunologia',
    type: 'estudo',
    origin: 'professor',
    disciplineId: d!.id,
    lessonId: null,
    topic: null,
    teacher: null,
    termId: null,
  });
  const version = await owner.query.materialVersions.findFirst({
    where: eq(s.materialVersions.materialId, material.id),
  });
  const chunks = chunkPages(
    pages.map((text, i) => ({ page: i + 1, text })),
    { target: 12, overlap: 0 },
  );
  const { vectors } = await new FakeEmbedder().embed(
    chunks.map((c) => c.text),
    'document',
  );
  await owner.insert(s.materialChunks).values(
    chunks.map((c, i) => ({
      ownerId: id,
      materialId: material.id,
      versionId: version!.id,
      position: c.position,
      pageFrom: c.pageFrom,
      pageTo: c.pageTo,
      text: c.text,
      embedding: vectors[i]!,
      model: 'fake-embed',
    })),
  );
  return { id, materialId: material.id };
}

const PAGES = [
  'Os leucócitos migram para o tecido inflamado.',
  'O sistema de condução cardíaca começa no nó sinusal.',
];

beforeAll(() => setFeatures({ materiais: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('busca por conceito (MAT-09)', () => {
  it('sem a autorização que cita a Voyage, pede; com ela, acha pelo assunto', async () => {
    const a = await student(PAGES);
    const before = await materials.search(a.id, { q: 'glóbulos brancos' });
    expect(before).toEqual({ items: [], concept: 'needs_consent' });

    await setConsent(a.id, 'ai_materials', true);
    const after = await materials.search(a.id, { q: 'glóbulos brancos' });
    expect(after.concept).toBe('on');
    expect(after.items[0]).toMatchObject({
      kind: 'pagina',
      materialId: a.materialId,
      page: 1,
      byConcept: true,
      link: `/app/materiais/${a.materialId}?pagina=1`,
    });
    expect(after.items.some((h) => h.page === 2)).toBe(false);
    const usage = await owner.select().from(s.aiUsage).where(eq(s.aiUsage.ownerId, a.id));
    expect(usage.map((u) => u.feature)).toContain('embedding_query');
  });

  it('o que a busca por palavra acha continua com o trecho marcado', async () => {
    const a = await student(PAGES);
    await setConsent(a.id, 'ai_materials', true);
    const r = await materials.search(a.id, { q: 'leucócitos' });
    const page = r.items.find((h) => h.kind === 'pagina' && h.page === 1)!;
    expect(page.byConcept).toBe(false);
    expect(page.snippet).toContain('«');
  });

  it('nunca acha material de outro aluno; retirar a autorização apaga os trechos', async () => {
    const a = await student(PAGES);
    const b = await student(['Anotação sem relação nenhuma.']);
    await setConsent(b.id, 'ai_materials', true);
    const r = await materials.search(b.id, { q: 'glóbulos brancos' });
    expect(r.items.filter((h) => h.materialId === a.materialId)).toEqual([]);

    await setConsent(a.id, 'ai_materials', true);
    await setConsent(a.id, 'ai_materials', false);
    const left = await owner
      .select()
      .from(s.materialChunks)
      .where(eq(s.materialChunks.ownerId, a.id));
    expect(left).toEqual([]);
  });
});
