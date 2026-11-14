import { randomBytes, randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as svc from './service';

// Material de estudo, conteúdo de aula e busca (SPEC v2, 5.10; plano, itens 52 a 54).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function student() {
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
  return { id, disciplineId: d!.id, termId: t!.id };
}

async function file(ownerId: string, pages: string[] = []) {
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId,
      originalName: 'slides.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
      sha256: randomBytes(32).toString('hex'),
      status: 'ready',
      kind: 'pdf',
      pageCount: pages.length,
      scannedAt: new Date(),
    })
    .returning();
  for (const [i, text] of pages.entries())
    await owner.insert(s.filePages).values({ fileId: f!.id, ownerId, page: i + 1, text });
  return f!.id;
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

const base = (fileId: string, disciplineId: string) => ({
  fileId,
  title: 'Slides de Inflamação',
  type: 'estudo' as const,
  origin: 'professor' as const,
  disciplineId,
  lessonId: null,
  topic: 'Inflamação',
  teacher: 'Dra. Juliana',
  termId: null,
});

beforeAll(() => setFeatures({ materiais: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('material de estudo', () => {
  it('anexa com tema e docente (criados ou reaproveitados), no semestre atual', async () => {
    const { id, disciplineId, termId } = await student();
    const { material } = await svc.createMaterial(id, base(await file(id), disciplineId));
    expect(material).toMatchObject({ title: 'Slides de Inflamação', version: 1, termId });
    expect(material.links).toMatchObject([
      { disciplineName: 'Patologia', topic: 'Inflamação', teacher: 'Dra. Juliana' },
    ]);
    // Segundo material com o mesmo tema escrito diferente: reaproveita.
    await svc.createMaterial(id, { ...base(await file(id), disciplineId), topic: 'inflamacao' });
    const topics = await owner
      .select()
      .from(s.disciplineTopics)
      .where(eq(s.disciplineTopics.disciplineId, disciplineId));
    expect(topics).toHaveLength(1);
  });

  it('abas: favoritos, lixeira e restaurar; versões guardam as anteriores', async () => {
    const { id, disciplineId } = await student();
    const { material } = await svc.createMaterial(id, base(await file(id), disciplineId));
    await svc.updateMaterial(id, material.id, { favorite: true });
    expect((await svc.listMaterials(id, { tab: 'favoritos' })).items).toHaveLength(1);
    const v2 = await svc.addVersion(id, material.id, await file(id));
    expect(v2.material.version).toBe(2);
    expect(v2.material.versions.map((v) => v.version)).toEqual([2, 1]);
    await svc.trashMaterial(id, material.id);
    expect((await svc.listMaterials(id, { tab: 'atual' })).items).toEqual([]);
    expect((await svc.listMaterials(id, { tab: 'lixeira' })).items).toHaveLength(1);
    await svc.restoreMaterial(id, material.id);
    expect((await svc.listMaterials(id, { tab: 'biblioteca' })).items).toHaveLength(1);
  });

  it('o mesmo material em duas aulas, sem cópia; conteúdo de aula em ordem', async () => {
    const { id, disciplineId } = await student();
    const [l1, l2] = await owner
      .insert(s.lessons)
      .values([
        {
          ownerId: id,
          disciplineId,
          title: 'Inflamação aguda',
          startsAt: new Date('2026-08-10T11:00:00Z'),
        },
        {
          ownerId: id,
          disciplineId,
          title: 'Inflamação crônica',
          startsAt: new Date('2026-08-17T11:00:00Z'),
        },
      ])
      .returning();
    const { material } = await svc.createMaterial(id, {
      ...base(await file(id), disciplineId),
      lessonId: l1!.id,
    });
    await svc.linkMaterial(id, material.id, { disciplineId, lessonId: l2!.id });
    const content = await svc.lessonContent(id, disciplineId);
    expect(content.lessons.map((l) => [l.title, l.materials.map((m) => m.id)])).toEqual([
      ['Inflamação aguda', [material.id]],
      ['Inflamação crônica', [material.id]],
    ]);
    expect(content.loose).toEqual([]);
    expect(await owner.select().from(s.materials).where(eq(s.materials.ownerId, id))).toHaveLength(
      1,
    );
  });

  it('outro aluno não usa arquivo, disciplina nem material de outro', async () => {
    const ana = await student();
    const beto = await student();
    const anaFile = await file(ana.id);
    await expect(
      svc.createMaterial(beto.id, base(anaFile, beto.disciplineId)),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      svc.createMaterial(beto.id, base(await file(beto.id), ana.disciplineId)),
    ).rejects.toMatchObject({ status: 404 });
    const { material } = await svc.createMaterial(ana.id, base(anaFile, ana.disciplineId));
    await expect(svc.trashMaterial(beto.id, material.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('busca por palavra (MAT-09)', () => {
  it('título, conteúdo com trecho marcado e lembretes; sem acento', async () => {
    const { id, disciplineId } = await student();
    const pages = ['Introdução ao curso.', 'A inflamação crônica tem infiltrado de macrófagos.'];
    await svc.createMaterial(id, base(await file(id, pages), disciplineId));
    await owner.insert(s.reminders).values({
      ownerId: id,
      title: 'Revisar inflamação',
      dueAt: new Date(),
    });
    const { items } = await svc.search(id, { q: 'inflamacao cronica' });
    const page = items.find((i) => i.kind === 'pagina')!;
    expect(page).toMatchObject({
      page: 2,
      disciplineName: 'Patologia',
      title: 'Slides de Inflamação',
    });
    expect(page.snippet).toContain('«inflamação»');
    expect(page.link).toMatch(/\?pagina=2$/);
    const all = await svc.search(id, { q: 'inflamacao' });
    expect(all.items.map((i) => i.kind).sort()).toEqual(['lembrete', 'material', 'pagina']);
  });

  it('só a versão atual entra; o material na lixeira sai', async () => {
    const { id, disciplineId } = await student();
    const { material } = await svc.createMaterial(
      id,
      base(await file(id, ['texto antigo sobre necrose']), disciplineId),
    );
    await svc.addVersion(id, material.id, await file(id, ['texto novo sobre apoptose']));
    expect((await svc.search(id, { q: 'necrose' })).items).toEqual([]);
    expect((await svc.search(id, { q: 'apoptose' })).items).toHaveLength(1);
    await svc.trashMaterial(id, material.id);
    expect((await svc.search(id, { q: 'apoptose' })).items).toEqual([]);
  });

  it('o aluno B busca um termo que só existe no material de A e não recebe nada', async () => {
    const ana = await student();
    const beto = await student();
    await svc.createMaterial(
      ana.id,
      base(await file(ana.id, ['glomerulonefrite membranosa']), ana.disciplineId),
    );
    expect((await svc.search(ana.id, { q: 'glomerulonefrite' })).items).toHaveLength(1);
    expect((await svc.search(beto.id, { q: 'glomerulonefrite' })).items).toEqual([]);
  });
});
