import { randomBytes, randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as materials from '@/features/materials/service';
import * as svc from './service';

// Acompanhar Aula (SPEC v2, 5.7; ADR 0015; plano, item 55).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function file(ownerId: string, pages: string[]) {
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

const PAGES = [
  'Inflamação aguda: vasodilatação e exsudato',
  'Inflamação crônica com macrófagos e linfócitos',
  'Cicatrização e reparo',
];

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
  const [l] = await owner
    .insert(s.lessons)
    .values({
      ownerId: id,
      disciplineId: d!.id,
      title: 'Inflamação',
      startsAt: new Date(Date.now() - 3 * 3_600_000),
      endsAt: new Date(Date.now() - 1 * 3_600_000),
    })
    .returning();
  const { material } = await materials.createMaterial(id, {
    fileId: await file(id, PAGES),
    title: 'Slides de Inflamação',
    type: 'estudo',
    origin: 'professor',
    disciplineId: d!.id,
    lessonId: l!.id,
    topic: null,
    teacher: null,
    termId: null,
  });
  const study = await svc.getLessonStudy(id, l!.id);
  return {
    id,
    disciplineId: d!.id,
    lessonId: l!.id,
    materialId: material.id,
    versionId: study.materials[0]!.versionId,
  };
}

const pen = (id: string, x = 0.1) => ({
  id,
  kind: 'pen' as const,
  color: '#c2181d',
  width: 0.004,
  points: [
    [x, 0.1, 0.5],
    [x + 0.1, 0.2, 0.6],
  ] as [number, number, number][],
});

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

beforeAll(() => setFeatures({ materiais: true, aula: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('página da aula (AUL-01)', () => {
  it('traz a aula, o material com a versão atual e o momento', async () => {
    const a = await student();
    const study = await svc.getLessonStudy(a.id, a.lessonId);
    expect(study.lesson).toMatchObject({
      title: 'Inflamação',
      disciplineName: 'Patologia',
      moment: 'depois',
    });
    expect(study.materials).toMatchObject([
      { id: a.materialId, version: 1, olderAnnotations: false },
    ]);
    expect(study.progress.concludedAt).toBeNull();
  });

  it('desligado pela chave, responde como inexistente', async () => {
    const a = await student();
    await setFeatures({ materiais: true, aula: false });
    await expect(svc.getLessonStudy(a.id, a.lessonId)).rejects.toMatchObject({ status: 404 });
    await setFeatures({ materiais: true, aula: true });
  });
});

describe('marcações (AUL-04 a AUL-07, AUL-12)', () => {
  it('grava, repete sem mudar nada e guarda a versão perdida num conflito', async () => {
    const a = await student();
    const base = { versionId: a.versionId, hidden: undefined };
    const first = await svc.saveAnnotation(a.id, a.materialId, 1, {
      ...base,
      baseRevision: 0,
      layer: [pen('a')],
    });
    expect(first).toMatchObject({ revision: 1, conflict: false });
    // A mesma gravação de novo (repetição): nada muda.
    const again = await svc.saveAnnotation(a.id, a.materialId, 1, {
      ...base,
      baseRevision: 0,
      layer: [pen('a')],
    });
    expect(again.revision).toBe(1);
    // Notebook grava a revisão 2.
    await svc.saveAnnotation(a.id, a.materialId, 1, {
      ...base,
      baseRevision: 1,
      layer: [pen('a'), pen('b', 0.3)],
    });
    // Tablet ainda na revisão 1: vence a última gravação, a do notebook vai para o histórico.
    const tablet = await svc.saveAnnotation(a.id, a.materialId, 1, {
      ...base,
      baseRevision: 1,
      layer: [pen('a'), pen('c', 0.5)],
    });
    expect(tablet).toMatchObject({ revision: 3, conflict: true });
    const hist = await svc.annotationHistory(a.id, a.materialId, 1, a.versionId);
    expect(hist.items).toMatchObject([{ revision: 2, reason: 'conflito', shapes: 2 }]);
    // Recupera a do notebook.
    const restored = await svc.restoreAnnotation(a.id, hist.items[0]!.id);
    expect(restored.layer.map((x) => x.id)).toEqual(['a', 'b']);
    expect((await svc.listAnnotations(a.id, a.materialId, a.versionId)).items).toHaveLength(1);
  });

  it('o PDF original não muda e página fora do arquivo é recusada', async () => {
    const a = await student();
    const before = await owner.select().from(s.files).where(eq(s.files.ownerId, a.id));
    await svc.saveAnnotation(a.id, a.materialId, 2, {
      versionId: a.versionId,
      baseRevision: 0,
      layer: [pen('a')],
    });
    expect(await owner.select().from(s.files).where(eq(s.files.ownerId, a.id))).toEqual(before);
    await expect(
      svc.saveAnnotation(a.id, a.materialId, 9, {
        versionId: a.versionId,
        baseRevision: 0,
        layer: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('outro aluno não lê nem grava nas marcações de outro', async () => {
    const a = await student();
    const b = await student();
    await svc.saveAnnotation(a.id, a.materialId, 1, {
      versionId: a.versionId,
      baseRevision: 0,
      layer: [pen('a')],
    });
    await expect(svc.listAnnotations(b.id, a.materialId, a.versionId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      svc.saveAnnotation(b.id, a.materialId, 1, {
        versionId: a.versionId,
        baseRevision: 1,
        layer: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
    // Versão de A com o material de B também não.
    await expect(
      svc.saveAnnotation(b.id, b.materialId, 1, {
        versionId: a.versionId,
        baseRevision: 0,
        layer: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('caderno, selos e conclusão', () => {
  it('nota no slide, busca sem acento e caderno da disciplina com a importância', async () => {
    const a = await student();
    const note = await svc.createNote(a.id, {
      lessonId: a.lessonId,
      disciplineId: null,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 2,
      region: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
      text: 'Macrófagos predominam na **inflamação crônica**',
    });
    expect(note).toMatchObject({ disciplineId: a.disciplineId, page: 2, revision: 1 });
    await svc.saveMark(a.id, {
      targetType: 'slide',
      lessonId: a.lessonId,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 2,
      region: null,
      topicId: null,
      importance: 'alta',
      difficulty: 'dificil',
    });
    const found = await svc.listNotes(a.id, { q: 'macrofago cronica' });
    expect(found.items).toMatchObject([{ id: note.id, importance: 'alta' }]);
    const disc = await svc.listNotes(a.id, { disciplineId: a.disciplineId });
    expect(disc.items).toHaveLength(1);
    const updated = await svc.updateNote(a.id, note.id, { text: 'Outro texto', baseRevision: 1 });
    expect(updated).toMatchObject({ revision: 2, conflict: false, text: 'Outro texto' });
    const hit = await materials.search(a.id, { q: 'outro texto' });
    expect(hit.items).toMatchObject([
      { kind: 'anotacao', link: expect.stringContaining(`/app/aulas/${a.lessonId}`) },
    ]);
  });

  it('um selo por slide, atualizado; dúvida entra e sai da revisão (AUL-16, AUL-21)', async () => {
    const a = await student();
    const slide = {
      targetType: 'slide' as const,
      lessonId: a.lessonId,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 1,
      region: null,
      topicId: null,
    };
    const m1 = await svc.saveMark(a.id, { ...slide, importance: 'importante' });
    const m2 = await svc.saveMark(a.id, { ...slide, doubt: 'Por que há edema?' });
    expect(m2).toMatchObject({ id: m1.id, importance: 'importante', doubt: 'Por que há edema?' });
    const resolved = await svc.updateMark(a.id, m1.id, { doubtResolved: true });
    expect(resolved.priority).toBeLessThan(m2.priority);
    const study = await svc.getLessonStudy(a.id, a.lessonId);
    expect(study.marks).toHaveLength(1);
  });

  it('concluir aula é opcional e reabre', async () => {
    const a = await student();
    const p = await svc.saveProgress(a.id, a.lessonId, {
      overallDifficulty: 'moderada',
      understoodGoals: true,
      wantsReview: true,
      concluded: true,
      attended: true,
    });
    expect(p).toMatchObject({ understoodGoals: true, wantsReview: true, attended: true });
    expect(p.concludedAt).not.toBeNull();
    const again = await svc.saveProgress(a.id, a.lessonId, { concluded: true });
    expect(again.concludedAt).toBe(p.concludedAt);
    expect((await svc.saveProgress(a.id, a.lessonId, { concluded: false })).concludedAt).toBeNull();
  });

  it('outro aluno não cria nota, selo ou progresso na aula de outro', async () => {
    const a = await student();
    const b = await student();
    await expect(
      svc.createNote(b.id, {
        lessonId: a.lessonId,
        disciplineId: null,
        materialId: null,
        versionId: null,
        page: null,
        region: null,
        text: 'x',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.saveMark(b.id, {
        targetType: 'slide',
        lessonId: null,
        materialId: a.materialId,
        versionId: a.versionId,
        page: 1,
        region: null,
        topicId: null,
        importance: 'alta',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(svc.saveProgress(b.id, a.lessonId, { concluded: true })).rejects.toMatchObject({
      status: 404,
    });
    expect((await svc.listNotes(b.id, { q: 'x' })).items).toEqual([]);
  });
});

describe('troca de versão (AUL-25)', () => {
  it('sugere pares pelo texto e leva marcações, notas e selos para a versão nova', async () => {
    const a = await student();
    await svc.saveAnnotation(a.id, a.materialId, 2, {
      versionId: a.versionId,
      baseRevision: 0,
      layer: [pen('a')],
    });
    await svc.createNote(a.id, {
      lessonId: a.lessonId,
      disciplineId: null,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 2,
      region: null,
      text: 'Nota do slide de inflamação crônica',
    });
    await svc.saveMark(a.id, {
      targetType: 'slide',
      lessonId: a.lessonId,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 2,
      region: null,
      topicId: null,
      importance: 'alta',
    });
    // Professor trocou a apresentação: um slide novo no começo.
    await materials.addVersion(
      a.id,
      a.materialId,
      await file(a.id, ['Objetivos da aula', ...PAGES]),
    );
    const study = await svc.getLessonStudy(a.id, a.lessonId);
    expect(study.materials[0]).toMatchObject({ version: 2, olderAnnotations: true });
    const plan = await svc.reassociationPlan(a.id, a.materialId);
    expect(plan).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      pages: [{ from: 2, to: 3, shapes: 1, notes: 1, marks: 1 }],
    });
    const { moved } = await svc.applyReassociation(a.id, a.materialId, {
      fromVersionId: plan.fromVersionId!,
      pairs: [{ from: 2, to: 3 }],
    });
    expect(moved).toBe(3);
    const newVersion = plan.toVersionId;
    expect(
      (await svc.listAnnotations(a.id, a.materialId, newVersion)).items.map((x) => x.page),
    ).toEqual([3]);
    const after = await svc.getLessonStudy(a.id, a.lessonId);
    expect(after.materials[0]!.olderAnnotations).toBe(false);
    expect(after.notes[0]).toMatchObject({ versionId: newVersion, page: 3, importance: 'alta' });
    // Nada a reassociar.
    expect((await svc.reassociationPlan(a.id, a.materialId)).pages).toEqual([]);
  });
});
