import { randomBytes, randomUUID } from 'node:crypto';
import { and, createDb, createPool, desc, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as materials from '@/features/materials/service';
import * as svc from './service';

// Ajuda Cognuss (SPEC v2, 5.14; ADR 0020; plano, itens 61 e 62). A geração em si roda no
// worker (testada lá); aqui, enfileirar, mostrar, editar, responder e isolar.
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

async function file(ownerId: string) {
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId,
      originalName: 'slides.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      sha256: randomBytes(32).toString('hex'),
      status: 'ready',
      scannedAt: new Date(),
      pageCount: 1,
    })
    .returning();
  return f!.id;
}

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
  const { material } = await materials.createMaterial(id, {
    fileId: await file(id),
    title: 'Slides',
    type: 'estudo',
    origin: 'professor',
    disciplineId: d!.id,
    lessonId: null,
    topic: null,
    teacher: null,
    termId: null,
  });
  return { id, disciplineId: d!.id, materialId: material.id };
}

/** Criação de questões como o worker grava, para testar o que sai para o navegador. */
async function questions(a: { id: string; disciplineId: string; materialId: string }) {
  const [c] = await owner
    .insert(s.creations)
    .values({
      ownerId: a.id,
      type: 'questoes',
      level: 'basico',
      title: 'Questões de Patologia',
      disciplineId: a.disciplineId,
      content: {
        title: 'Questões de Patologia',
        questions: [{ stem: 'x', correctIndex: 1, comment: 'segredo' }],
        notCovered: null,
        sources: [{ ref: 'P1', label: 'Slides, página 1', materialId: a.materialId, page: 1 }],
        warnings: [],
      },
    })
    .returning();
  const [q] = await owner
    .insert(s.creationQuestions)
    .values({
      ownerId: a.id,
      creationId: c!.id,
      position: 1,
      kind: 'objetiva',
      stem: 'Qual célula predomina na inflamação crônica?',
      options: ['Neutrófilo', 'Macrófago', 'Eosinófilo'],
      correctIndex: 1,
      comment: 'Macrófagos predominam na fase crônica.',
      difficulty: 'facil',
      refs: ['P1'],
    })
    .returning();
  return { creationId: c!.id, questionId: q!.id };
}

beforeAll(() => setFeatures({ ajuda: true, materiais: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('Criar com IA (AJU-01)', () => {
  it('sem autorização, pede; com ela, enfileira com a disciplina do material', async () => {
    const a = await student();
    const body = { type: 'resumo' as const, level: 'basico' as const, materialIds: [a.materialId] };
    await expect(svc.createJob(a.id, body)).rejects.toMatchObject({ status: 409 });
    const job = await svc.createJob(a.id, { ...body, grantConsent: true });
    expect(job).toMatchObject({ status: 'queued', type: 'resumo' });
    const row = await owner.query.aiJobs.findFirst({ where: eq(s.aiJobs.id, job.id) });
    expect(row!.input).toMatchObject({ materialIds: [a.materialId], disciplineId: a.disciplineId });
    const [event] = await owner
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.topic, 'ai.create'))
      .orderBy(desc(s.outbox.id))
      .limit(1);
    expect(event!.payload).toMatchObject({ jobId: job.id, userId: a.id });
    // Cancelar antes de rodar.
    expect((await svc.cancelJob(a.id, job.id)).status).toBe('cancelled');
  });

  it('material de outro aluno não entra', async () => {
    const a = await student();
    const b = await student();
    await expect(
      svc.createJob(b.id, {
        type: 'resumo',
        level: 'basico',
        materialIds: [a.materialId],
        grantConsent: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('questões geradas (MEM-03, IA-9)', () => {
  it('o gabarito não sai antes da tentativa; depois sai com o comentário', async () => {
    const a = await student();
    const { creationId, questionId } = await questions(a);
    const c = await svc.getCreation(a.id, creationId);
    expect(JSON.stringify(c)).not.toContain('segredo');
    expect(c.questions[0]).toMatchObject({
      answer: null,
      options: ['Neutrófilo', 'Macrófago', 'Eosinófilo'],
    });
    expect(JSON.stringify(c.questions)).not.toContain('Macrófagos predominam');
    const answered = await svc.answerQuestion(a.id, questionId, { chosenIndex: 0 }, 'k1');
    expect(answered.answer).toMatchObject({ correct: false, correctIndex: 1 });
    // Repetição com a mesma chave: a mesma tentativa.
    const again = await svc.answerQuestion(a.id, questionId, { chosenIndex: 1 }, 'k1');
    expect(again.answer).toMatchObject({ chosenIndex: 0, correct: false });
    const attempts = await owner
      .select()
      .from(s.creationQuestionAttempts)
      .where(eq(s.creationQuestionAttempts.questionId, questionId));
    expect(attempts).toHaveLength(1);
  });

  it('outro aluno não lê, não responde, não edita nem apaga', async () => {
    const a = await student();
    const b = await student();
    const { creationId, questionId } = await questions(a);
    await expect(svc.getCreation(b.id, creationId)).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.answerQuestion(b.id, questionId, { chosenIndex: 1 }, null),
    ).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateCreation(b.id, creationId, { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(svc.deleteCreation(b.id, creationId)).rejects.toMatchObject({ status: 404 });
    expect((await svc.listCreations(b.id, {})).items).toEqual([]);
  });
});

describe('Minhas criações (AJU-10 a AJU-12)', () => {
  it('editar valida pelo esquema; material novo marca como desatualizada; exporta', async () => {
    const a = await student();
    const content = {
      title: 'Flashcards',
      cards: [{ front: 'O que é?', back: 'Resposta', difficulty: 'facil', refs: ['P1'] }],
      notCovered: null,
      sources: [{ ref: 'P1', label: 'Slides, página 1', materialId: a.materialId, page: 1 }],
      warnings: [],
    };
    const [c] = await owner
      .insert(s.creations)
      .values({
        ownerId: a.id,
        type: 'flashcards',
        level: 'basico',
        title: 'Flashcards',
        content,
        disciplineId: a.disciplineId,
      })
      .returning();
    await expect(
      svc.updateCreation(a.id, c!.id, { content: { cards: 'nada' } }),
    ).rejects.toMatchObject({ status: 400 });
    const edited = await svc.updateCreation(a.id, c!.id, {
      title: 'Meus cartões',
      content: { ...content, cards: [{ ...content.cards[0], back: 'Editada' }] },
    });
    expect(edited).toMatchObject({ title: 'Meus cartões', edited: true });
    expect(edited.sources).toHaveLength(1);

    // Material novo na disciplina (AJU-11).
    await materials.createMaterial(a.id, {
      fileId: await file(a.id),
      title: 'Apostila',
      type: 'estudo',
      origin: 'professor',
      disciplineId: a.disciplineId,
      lessonId: null,
      topic: null,
      teacher: null,
      termId: null,
    });
    expect((await svc.getCreation(a.id, c!.id)).stale).toBe(true);

    const anki = await svc.exportCreation(a.id, c!.id, 'anki');
    expect(anki.body).toBe('"O que é?","Editada"\n');
    const md = await svc.exportCreation(a.id, c!.id, 'texto');
    expect(md.body).toContain('Gerado por IA a partir dos seus materiais');
    expect(md.body).toContain('P1: Slides, página 1');
  });

  it('excluir leva junto os flashcards gerados', async () => {
    const a = await student();
    const [c] = await owner
      .insert(s.creations)
      .values({ ownerId: a.id, type: 'flashcards', level: 'basico', title: 'F', content: {} })
      .returning();
    await owner
      .insert(s.flashcards)
      .values({ ownerId: a.id, front: 'f', back: 'b', creationId: c!.id });
    await svc.deleteCreation(a.id, c!.id);
    expect(
      await owner
        .select()
        .from(s.flashcards)
        .where(and(eq(s.flashcards.ownerId, a.id))),
    ).toEqual([]);
  });

  it('desligado pela chave, responde como inexistente', async () => {
    const a = await student();
    await setFeatures({ ajuda: false, materiais: true });
    await expect(svc.listCreations(a.id, {})).rejects.toMatchObject({ status: 404 });
    await setFeatures({ ajuda: true, materiais: true });
  });
});

describe('análise de provas (MAT-11, MAT-12)', () => {
  it('só aceita provas e atividades; a exportação traz a contagem e o aviso', async () => {
    const a = await student();
    const body = {
      type: 'analise' as const,
      level: 'intermediario' as const,
      materialIds: [a.materialId],
      grantConsent: true,
    };
    await expect(svc.createJob(a.id, body)).rejects.toMatchObject({ status: 400 });
    await owner.update(s.materials).set({ type: 'prova' }).where(eq(s.materials.id, a.materialId));
    const job = await svc.createJob(a.id, body);
    expect(job).toMatchObject({ status: 'queued', type: 'analise' });
    await svc.cancelJob(a.id, job.id);

    // Como o worker grava (testado lá): frequência por documento e aviso.
    const [c] = await owner
      .insert(s.creations)
      .values({
        ownerId: a.id,
        type: 'analise',
        level: 'intermediario',
        title: 'Análise de provas: Patologia',
        content: {
          title: 'Análise de provas: Patologia',
          documentsAnalyzed: 2,
          notice: 'Frequência passada não garante cobrança futura.',
          topics: [
            { name: 'Inflamação aguda', detail: 'Caiu nas duas.', refs: ['P1'], documents: 2 },
          ],
          formats: [],
          competencies: [],
          directions: [{ topic: 'Inflamação aguda', suggestion: 'Revise primeiro.', refs: ['P1'] }],
          notCovered: null,
          sources: [{ ref: 'P1', label: 'Prova, página 1', materialId: a.materialId, page: 1 }],
          warnings: [],
        },
      })
      .returning();
    const dto = await svc.getCreation(a.id, c!.id);
    const md = svc.toMarkdown(dto);
    expect(md).toContain('**2 documentos analisados.** Frequência passada não garante');
    expect(md).toContain('- **Inflamação aguda** (em 2 de 2): Caiu nas duas. (Prova, página 1)');
    expect(md).toContain('## O que revisar');
  });
});
