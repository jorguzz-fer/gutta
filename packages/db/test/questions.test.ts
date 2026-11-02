import { and, eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

const { app, owner, appPool, ownerPool } = connect();
let aluno: string;
let outro: string;
let editor: string;
let published: { id: string; correct: string; wrong: string };

beforeAll(async () => {
  aluno = await makeUser(owner);
  outro = await makeUser(owner);
  editor = await makeUser(owner, ['editor']);
  const q = await owner.query.questions.findFirst({ where: eq(s.questions.status, 'published') });
  const opts = await owner
    .select()
    .from(s.questionOptions)
    .where(eq(s.questionOptions.questionId, q!.id));
  published = {
    id: q!.id,
    correct: opts.find((o) => o.isCorrect)!.id,
    wrong: opts.find((o) => !o.isCorrect)!.id,
  };
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

async function newSession(student: string) {
  const [row] = await withUser(app, student, (tx) =>
    tx
      .insert(s.questionSessions)
      .values({ studentId: student, algorithmVersion: 'teste' })
      .returning(),
  );
  return row!.id;
}

describe('tentativas', () => {
  it('o banco corrige: is_correct enviado pelo cliente é ignorado', async () => {
    const sessionId = await newSession(aluno);
    const [a] = await withUser(app, aluno, (tx) =>
      tx
        .insert(s.questionAttempts)
        .values({
          sessionId,
          questionId: published.id,
          studentId: aluno,
          selectedOptionId: published.wrong,
          isCorrect: true,
          clientAttemptKey: `k-${Date.now()}`,
        })
        .returning(),
    );
    expect(a!.isCorrect).toBe(false);
  });

  it('alternativa de outra questão é rejeitada', async () => {
    const sessionId = await newSession(aluno);
    const otherQuestion = await owner.query.questions.findFirst({
      where: and(eq(s.questions.status, 'published'), ne(s.questions.id, published.id)),
    });
    const foreignOption = await owner.query.questionOptions.findFirst({
      where: eq(s.questionOptions.questionId, otherQuestion!.id),
    });
    const err = await withUser(app, aluno, (tx) =>
      tx.insert(s.questionAttempts).values({
        sessionId,
        questionId: published.id,
        studentId: aluno,
        selectedOptionId: foreignOption!.id,
        clientAttemptKey: `x-${Date.now()}`,
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');
  });

  it('mesma chave idempotente não grava duas vezes', async () => {
    const sessionId = await newSession(aluno);
    const key = `idem-${Date.now()}`;
    const values = {
      sessionId,
      questionId: published.id,
      studentId: aluno,
      selectedOptionId: published.correct,
      clientAttemptKey: key,
    };
    await withUser(app, aluno, (tx) => tx.insert(s.questionAttempts).values(values));
    const second = await withUser(app, aluno, (tx) =>
      tx.insert(s.questionAttempts).values(values).onConflictDoNothing().returning(),
    );
    expect(second).toHaveLength(0);
  });

  it('aluno não registra tentativa em sessão de outro nem lê tentativas alheias', async () => {
    const sessionOutro = await newSession(outro);
    const err = await withUser(app, aluno, (tx) =>
      tx.insert(s.questionAttempts).values({
        sessionId: sessionOutro,
        questionId: published.id,
        studentId: aluno,
        selectedOptionId: published.correct,
        clientAttemptKey: `cross-${Date.now()}`,
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    const seen = await withUser(app, outro, (tx) =>
      tx.select().from(s.questionAttempts).where(eq(s.questionAttempts.studentId, aluno)),
    );
    expect(seen).toHaveLength(0);
  });

  it('tentativa não pode ser alterada depois', async () => {
    const err = await withUser(app, aluno, (tx) =>
      tx
        .update(s.questionAttempts)
        .set({ isCorrect: true })
        .where(eq(s.questionAttempts.studentId, aluno)),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });
});

describe('questões em rascunho', () => {
  it('rascunho e suas alternativas são invisíveis ao aluno; editor não mexe em publicada', async () => {
    const topic = await owner.query.topics.findFirst();
    const [draft] = await withUser(app, editor, (tx) =>
      tx
        .insert(s.questions)
        .values({
          topicId: topic!.id,
          disciplineId: topic!.disciplineId,
          stem: 'Rascunho?',
          authorId: editor,
        })
        .returning(),
    );
    await withUser(app, editor, (tx) =>
      tx.insert(s.questionOptions).values([
        { questionId: draft!.id, displayOrder: 0, body: 'A', isCorrect: true },
        { questionId: draft!.id, displayOrder: 1, body: 'B' },
      ]),
    );
    expect(draft!.rootId).toBe(draft!.id);
    const q = await withUser(app, aluno, (tx) =>
      tx.select().from(s.questions).where(eq(s.questions.id, draft!.id)),
    );
    const o = await withUser(app, aluno, (tx) =>
      tx.select().from(s.questionOptions).where(eq(s.questionOptions.questionId, draft!.id)),
    );
    expect(q).toHaveLength(0);
    expect(o).toHaveLength(0);

    const sessionId = await newSession(aluno);
    const opt = await owner.query.questionOptions.findFirst({
      where: eq(s.questionOptions.questionId, draft!.id),
    });
    const err = await withUser(app, aluno, (tx) =>
      tx.insert(s.questionAttempts).values({
        sessionId,
        questionId: draft!.id,
        studentId: aluno,
        selectedOptionId: opt!.id,
        clientAttemptKey: `draft-${Date.now()}`,
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');

    const edit = await withUser(app, editor, (tx) =>
      tx
        .update(s.questionOptions)
        .set({ isCorrect: false })
        .where(eq(s.questionOptions.id, published.correct)),
    ).catch((e) => e);
    expect(pgCode(edit)).toBe('42501');
  });
});
