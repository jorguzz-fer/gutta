import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { keys, MemoryStorage } from '@gutta/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setStorageForTests } from '@/lib/storage';
import * as review from './review';

// Revisão e publicação das peças (docs/producao, Fase 4; ADR 0021) contra o banco de teste:
// a peça vira módulo e as questões do plano viram questões em revisão, com selo; só outro
// revisor aprova; o pedido de ajuste volta para a geração; publicar mostra a aula ao aluno.
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
const store = new MemoryStorage();

async function user(roles: (typeof s.appRole.enumValues)[number][]) {
  const id = randomUUID();
  await owner.insert(s.authUsers).values({
    id,
    name: `Pessoa ${id.slice(0, 4)}`,
    email: `${id}@teste.gutta`,
    emailVerified: true,
  });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return id;
}

const plan = {
  pieceType: 'stepper',
  title: 'Eixo HHA',
  theme: 'Eixo',
  lead: 'Siga o eixo do hipotálamo à suprarrenal.',
  interaction: 'Passo a passo.',
  scenarios: [{ id: 'normal', label: 'Normal', description: 'Eixo normal.' }],
  fixar: 'Retroalimentação negativa.',
  naProva: 'Cortisol exógeno suprime o ACTH.',
  centralTheme: true,
  questions: [
    {
      kind: 'caso_clinico',
      stem: 'Paciente em uso de prednisona: o que acontece com o ACTH?',
      options: [
        { text: 'Cai', correct: true, why: 'Retroalimentação negativa.' },
        { text: 'Sobe', correct: false, why: 'Confunde com insuficiência primária.' },
        { text: 'Não muda', correct: false, why: 'Ignora o eixo.' },
        { text: 'Oscila', correct: false, why: 'Sem base.' },
      ],
      explanation: 'O corticoide exógeno suprime o eixo.',
      scenario: null,
    },
    {
      kind: 'conceito',
      stem: 'Questão sem alternativa correta (não deve ir).',
      options: [
        { text: 'A', correct: false, why: '' },
        { text: 'B', correct: false, why: '' },
        { text: 'C', correct: false, why: '' },
        { text: 'D', correct: false, why: '' },
      ],
      explanation: '',
      scenario: null,
    },
  ],
  media: [],
  reviewNotes: ['Conferir a seta do feedback.'],
};

async function generatedBatch(admin: string) {
  const topic = (await owner.query.topics.findFirst())!;
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: admin,
      originalName: 'aula.pptx',
      mime: 'application/pdf',
      sizeBytes: 1,
      sha256: 'b'.repeat(64),
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
      status: 'generated',
      bibliography: 'Aires, Fisiologia, 5ª ed.',
    })
    .returning();
  const [t] = await owner
    .insert(s.productionTasks)
    .values({
      batchId: b!.id,
      position: 1,
      origin: 'instruction',
      sourceSlides: [],
      targetSlides: [],
      instruction: 'Montar o eixo HHA.',
      pieceType: 'stepper',
      title: 'Eixo HHA: retroalimentação',
      plan,
      status: 'generated',
      currentVersion: 1,
    })
    .returning();
  await owner.insert(s.productionAssets).values({
    batchId: b!.id,
    taskId: t!.id,
    kind: 'html',
    version: 1,
    provider: 'fake',
    storageKey: keys.productionPiece(b!.id, t!.id, 1),
    meta: { ok: true },
  });
  await store.put(
    keys.productionPiece(b!.id, t!.id, 1),
    Buffer.from(
      JSON.stringify({
        title: 'Eixo HHA',
        style: '',
        body: '<section><h1>Eixo HHA</h1></section>',
        script: '',
      }),
    ),
    'application/json',
  );
  return { batchId: b!.id, taskId: t!.id };
}

const task = async (id: string) =>
  (await owner.query.productionTasks.findFirst({ where: eq(s.productionTasks.id, id) }))!;
const mod = async (id: string) =>
  (await owner.query.modules.findFirst({ where: eq(s.modules.id, id) }))!;

beforeAll(() => setStorageForTests(store));
afterAll(async () => {
  setStorageForTests(null);
  await ownerPool.end();
});

describe('revisão das peças (Fase 4)', () => {
  it('envia, aprova por outro revisor, publica e o aluno vê a aula sem selo', async () => {
    const admin = await user(['admin']);
    const reviewer = await user(['reviewer']);
    const student = await user(['student']);
    const { batchId, taskId } = await generatedBatch(admin);

    const sent = await review.sendToReview(admin, batchId);
    expect(sent).toMatchObject({ sent: 1, questions: 1 });
    expect(sent.skipped).toHaveLength(1);
    let t = await task(taskId);
    let m = await mod(t.moduleId!);
    expect(m).toMatchObject({ status: 'in_review', isDemo: true, authorId: admin });
    expect(m.lessonUrl).toBe(review.lessonPath(m.id));
    const [q] = await owner.select().from(s.questions).where(eq(s.questions.id, t.questionIds[0]!));
    expect(q).toMatchObject({ status: 'in_review', isDemo: true });
    const sources = await owner
      .select()
      .from(s.questionSources)
      .where(eq(s.questionSources.questionId, q!.id));
    expect(sources.map((x) => x.citation)).toEqual(['Aires, Fisiologia, 5ª ed.']);
    // Enviar de novo não duplica.
    await expect(review.sendToReview(admin, batchId)).rejects.toMatchObject({ status: 409 });

    // O revisor vê a fila e a peça, com o que a IA pediu para conferir.
    const queue = await review.reviewQueue(reviewer);
    expect(queue.items.find((i) => i.taskId === taskId)).toMatchObject({
      moduleStatus: 'in_review',
      questions: 1,
    });
    const r = await review.getReview(reviewer, taskId);
    expect(r.reviewNotes).toEqual(['Conferir a seta do feedback.']);
    expect(r.questions[0]!.options.find((o) => o.correct)!.explanation).toContain('suprime o eixo');

    // Quem enviou não aprova o próprio conteúdo (o banco recusa).
    await expect(
      review.approveReview(admin, taskId, { discardQuestions: [], comment: null }),
    ).rejects.toMatchObject({ status: 403 });

    await review.approveReview(reviewer, taskId, { discardQuestions: [], comment: 'Ok.' });
    t = await task(taskId);
    m = await mod(t.moduleId!);
    expect(m).toMatchObject({ status: 'approved', isDemo: false, reviewerId: reviewer });
    expect(t.approvedVersion).toBe(1);

    // Antes de publicar, o aluno não vê a aula.
    await expect(review.lessonHtml(student, m.id)).rejects.toMatchObject({ status: 404 });
    expect(await review.publishBatch(reviewer, batchId)).toEqual({ published: 1 });
    m = await mod(t.moduleId!);
    expect(m.status).toBe('published');
    expect(m.publishedAt).not.toBeNull();
    const [pq] = await owner.select().from(s.questions).where(eq(s.questions.id, q!.id));
    expect(pq).toMatchObject({ status: 'published', isDemo: false });

    const html = await review.lessonHtml(student, m.id);
    expect(html).toContain('Eixo HHA');
    expect(html).not.toContain('Demonstração · sem revisão');
    expect(html).toContain('Aires, Fisiologia');
  });

  it('pedir ajuste: registra o trecho, volta para a geração com o comentário e para o worker do admin', async () => {
    const admin = await user(['admin']);
    const reviewer = await user(['reviewer']);
    const { batchId, taskId } = await generatedBatch(admin);
    await review.sendToReview(admin, batchId);

    await review.requestChanges(reviewer, taskId, {
      excerpt: 'Cenário: Normal',
      comment: 'A seta do cortisol para o hipotálamo está ao contrário.',
    });
    const t = await task(taskId);
    expect(t.status).toBe('generating');
    expect(t.backToReview).toBe(true);
    expect(t.pendingNote).toContain('Cenário: Normal');
    expect(t.pendingNote).toContain('seta do cortisol');
    expect((await mod(t.moduleId!)).status).toBe('in_review');
    const [ev] = await owner
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.topic, 'production.generate_piece'));
    expect(ev).toBeTruthy();
    const events = await owner.select().from(s.outbox);
    const mine = events.filter(
      (e) =>
        e.topic === 'production.generate_piece' &&
        (e.payload as { taskId: string }).taskId === taskId,
    );
    // O worker trabalha como o admin dono do lote: ele grava versões e mídia.
    expect((mine.at(-1)!.payload as { userId: string }).userId).toBe(admin);

    // Enquanto gera, não dá para decidir.
    await expect(
      review.approveReview(reviewer, taskId, { discardQuestions: [], comment: null }),
    ).rejects.toMatchObject({ status: 409 });
    const r = await review.getReview(reviewer, taskId);
    expect(r.reviews[0]).toMatchObject({ decision: 'changes', excerpt: 'Cenário: Normal' });
  });

  it('questão descartada pelo revisor fica fora da aula, em rascunho', async () => {
    const admin = await user(['admin']);
    const reviewer = await user(['reviewer']);
    const { batchId, taskId } = await generatedBatch(admin);
    await review.sendToReview(admin, batchId);
    const qid = (await task(taskId)).questionIds[0]!;
    await review.approveReview(reviewer, taskId, { discardQuestions: [qid], comment: null });
    expect((await task(taskId)).questionIds).toEqual([]);
    const [q] = await owner.select().from(s.questions).where(eq(s.questions.id, qid));
    expect(q!.status).toBe('draft');
  });

  it('aluno e editor sem papel de revisor não acessam a fila', async () => {
    const student = await user(['student']);
    const queue = await review.reviewQueue(student);
    expect(queue.items).toEqual([]);
  });
});
