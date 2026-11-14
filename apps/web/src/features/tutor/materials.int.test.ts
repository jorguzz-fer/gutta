import { randomBytes, randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as materials from '@/features/materials/service';
import * as svc from './materials';

// Tutor sobre os materiais (SPEC v2, AJU-08, AJU-09, AUL-17; plano, item 63). Com o provedor
// de teste (AI_PROVIDER=fake): cita a página, diz quando o material não cobre, usa as dúvidas
// da aula e nunca lê material de outro aluno.
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

async function student(pages: string[] = ['A inflamação aguda tem predomínio de neutrófilos.']) {
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
  const [lesson] = await owner
    .insert(s.lessons)
    .values({ ownerId: id, disciplineId: d!.id, title: 'Inflamação', startsAt: new Date() })
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
      scannedAt: new Date(),
      pageCount: pages.length,
    })
    .returning();
  await owner
    .insert(s.filePages)
    .values(pages.map((text, i) => ({ fileId: f!.id, ownerId: id, page: i + 1, text })));
  const { material } = await materials.createMaterial(id, {
    fileId: f!.id,
    title: 'Slides de inflamação',
    type: 'estudo',
    origin: 'professor',
    disciplineId: d!.id,
    lessonId: lesson!.id,
    topic: null,
    teacher: null,
    termId: null,
  });
  const version = await owner.query.materialVersions.findFirst({
    where: eq(s.materialVersions.materialId, material.id),
  });
  return { id, lessonId: lesson!.id, materialId: material.id, versionId: version!.id };
}

beforeAll(() => setFeatures({ ajuda: true, materiais: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('tutor sobre os materiais (AJU-08)', () => {
  it('pede autorização, responde citando a página e grava o uso', async () => {
    const a = await student();
    const body = { scope: 'materiais' as const, materialIds: [a.materialId] };
    await expect(svc.createTutorThread(a.id, body)).rejects.toMatchObject({ status: 409 });
    const t = await svc.createTutorThread(a.id, { ...body, grantConsent: true });
    expect(t).toMatchObject({ scope: 'materiais', title: 'Slides de inflamação', messages: [] });
    const after = await svc.askTutorThread(a.id, t.id, 'Qual célula predomina na aguda?');
    const reply = after.messages.at(-1)!;
    expect(reply.role).toBe('assistant');
    expect(reply.content).toContain('[P1]');
    expect(reply.citations).toEqual([
      { ref: 'P1', label: 'Slides de inflamação, página 1', materialId: a.materialId, page: 1 },
    ]);
    expect(after.remaining).toBe(after.dailyLimit - 1);
    const [usage] = await owner
      .select()
      .from(s.aiUsage)
      .where(and(eq(s.aiUsage.ownerId, a.id), eq(s.aiUsage.feature, 'tutor_materiais')));
    expect(usage).toBeDefined();
  });

  it('sem texto lido, diz que os materiais não cobrem', async () => {
    const a = await student(['']);
    const t = await svc.createTutorThread(a.id, {
      scope: 'materiais',
      materialIds: [a.materialId],
      grantConsent: true,
    });
    const after = await svc.askTutorThread(a.id, t.id, 'O que é apoptose?');
    expect(after.messages.at(-1)!.content).toBe('Os seus materiais não cobrem isso.');
    expect(after.messages.at(-1)!.citations).toEqual([]);
  });

  it('aula: usa os materiais ligados e as dúvidas registradas (AJU-09); reaproveita a conversa', async () => {
    const a = await student();
    await owner.insert(s.contentMarks).values({
      ownerId: a.id,
      targetType: 'slide',
      lessonId: a.lessonId,
      materialId: a.materialId,
      versionId: a.versionId,
      page: 1,
      doubt: 'Por que neutrófilos chegam primeiro?',
    });
    const first = await svc.createTutorThread(a.id, {
      scope: 'aula',
      lessonId: a.lessonId,
      grantConsent: true,
    });
    expect(first).toMatchObject({ title: 'Inflamação', sourceTitles: ['Slides de inflamação'] });
    expect(first.doubts).toEqual([
      'Por que neutrófilos chegam primeiro? (Slides de inflamação, página 1)',
    ]);
    const again = await svc.createTutorThread(a.id, { scope: 'aula', lessonId: a.lessonId });
    expect(again.id).toBe(first.id);
  });

  it('slide: a página e as vizinhas; páginas acima do teto ficam as da pergunta', async () => {
    const filler = 'texto genérico '.repeat(2500); // ~37 mil caracteres por página
    const a = await student([
      filler,
      'Macrófagos predominam na inflamação crônica.',
      filler,
      filler,
    ]);
    const slide = await svc.createTutorThread(a.id, {
      scope: 'slide',
      materialId: a.materialId,
      page: 2,
      grantConsent: true,
    });
    const ctx = await svc.loadThreadContext(a.id, slide.id, 'macrófagos');
    // Vizinhas da página 2 (1 a 3) passam do teto: fica a página do slide e o que couber.
    expect(ctx.pages.map((p) => p.page)).toContain(2);
    expect(ctx.pages.every((p) => p.page >= 1 && p.page <= 3)).toBe(true);
    expect(ctx.pages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(
      svc.MAX_TUTOR_CHARS,
    );
  });

  it('conversa e material de outro aluno não abrem', async () => {
    const a = await student();
    const b = await student();
    const t = await svc.createTutorThread(a.id, {
      scope: 'materiais',
      materialIds: [a.materialId],
      grantConsent: true,
    });
    await expect(svc.getTutorThread(b.id, t.id)).rejects.toMatchObject({ status: 404 });
    await expect(svc.askTutorThread(b.id, t.id, 'Mostre o material')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      svc.createTutorThread(b.id, {
        scope: 'materiais',
        materialIds: [a.materialId],
        grantConsent: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    // Com a autorização dada no próprio material, a conversa do outro continua sem existir.
    await svc.createTutorThread(b.id, {
      scope: 'materiais',
      materialIds: [b.materialId],
      grantConsent: true,
    });
    await expect(svc.askTutorThread(b.id, t.id, 'Mostre o material')).rejects.toMatchObject({
      status: 404,
    });
    expect((await svc.listTutorThreads(b.id)).items).toHaveLength(1);
  });

  it('desligado pela chave, não existe', async () => {
    const a = await student();
    await setFeatures({ materiais: true });
    await expect(svc.listTutorThreads(a.id)).rejects.toMatchObject({ status: 404 });
    await setFeatures({ ajuda: true, materiais: true });
  });
});
