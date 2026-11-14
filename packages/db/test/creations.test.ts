import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Ajuda Cognuss (SPEC v2, 5.14 e 8.7; ADR 0020; plano, item 60).
const { app, owner, appPool, ownerPool } = connect();

async function setup(user: string) {
  return withUser(app, user, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: user, label: 'Atual' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: user, termId: t!.id, name: 'Patologia' })
      .returning();
    const [f] = await tx
      .insert(s.files)
      .values({
        ownerId: user,
        originalName: 'slides.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        sha256: randomBytes(32).toString('hex'),
        status: 'ready',
      })
      .returning();
    const [m] = await tx.insert(s.materials).values({ ownerId: user, title: 'Slides' }).returning();
    const [v] = await tx
      .insert(s.materialVersions)
      .values({ ownerId: user, materialId: m!.id, fileId: f!.id, version: 1 })
      .returning();
    const [j] = await tx
      .insert(s.aiJobs)
      .values({ ownerId: user, feature: 'criacao', input: { type: 'resumo' } })
      .returning();
    const [c] = await tx
      .insert(s.creations)
      .values({
        ownerId: user,
        jobId: j!.id,
        type: 'questoes',
        level: 'basico',
        title: 'Questões',
        content: {},
        disciplineId: d!.id,
      })
      .returning();
    await tx
      .insert(s.creationSources)
      .values({
        ownerId: user,
        creationId: c!.id,
        materialId: m!.id,
        versionId: v!.id,
        pages: [1, 2],
      });
    const [q] = await tx
      .insert(s.creationQuestions)
      .values({
        ownerId: user,
        creationId: c!.id,
        position: 1,
        kind: 'objetiva',
        stem: 'Qual?',
        options: ['a', 'b'],
        correctIndex: 1,
        comment: 'b',
        difficulty: 'facil',
        refs: ['P1'],
      })
      .returning();
    return { disc: d!.id, material: m!.id, creation: c!.id, question: q!.id };
  });
}

let ana: string;
let beto: string;
let a: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  a = await setup(ana);
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('Ajuda Cognuss: isolamento', () => {
  it('outro aluno não lê trabalhos, criações, fontes, questões nem tentativas', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      jobs: await tx.select().from(s.aiJobs),
      creations: await tx.select().from(s.creations),
      sources: await tx.select().from(s.creationSources),
      questions: await tx.select().from(s.creationQuestions),
      attempts: await tx.select().from(s.creationQuestionAttempts),
    }));
    expect(seen).toEqual({ jobs: [], creations: [], sources: [], questions: [], attempts: [] });
  });

  it('não aponta para criação, questão, material ou disciplina de outro', async () => {
    const tries = [
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.creations).values({
            ownerId: beto,
            type: 'resumo',
            level: 'basico',
            title: 'x',
            content: {},
            disciplineId: a.disc,
          }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.creationQuestionAttempts).values({ ownerId: beto, questionId: a.question }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.flashcards).values({
            ownerId: beto,
            front: 'f',
            back: 'b',
            creationId: a.creation,
          }),
        ),
    ];
    for (const run of tries) expect(pgCode(await run().catch((e) => e))).toBe('42501');
  });

  it('questão objetiva precisa de gabarito; flashcard gerado fica ligado à criação', async () => {
    const bad = await withUser(app, ana, (tx) =>
      tx.insert(s.creationQuestions).values({
        ownerId: ana,
        creationId: a.creation,
        position: 2,
        kind: 'objetiva',
        stem: 'x',
        options: ['a', 'b'],
        comment: 'c',
        difficulty: 'facil',
        refs: ['P1'],
      }),
    ).catch((e) => e);
    expect(pgCode(bad)).toBe('23514');
    const [card] = await withUser(app, ana, (tx) =>
      tx
        .insert(s.flashcards)
        .values({
          ownerId: ana,
          front: 'f',
          back: 'b',
          creationId: a.creation,
          enrolledDisciplineId: a.disc,
        })
        .returning(),
    );
    expect(card).toMatchObject({ creationId: a.creation, visibility: 'private' });
  });
});
