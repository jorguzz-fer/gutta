import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Acompanhar Aula (SPEC v2, 5.7 e 8.5; ADR 0015; plano, item 55).
const { app, owner, appPool, ownerPool } = connect();

type Setup = { disc: string; lesson: string; material: string; version: string };

async function setup(user: string): Promise<Setup> {
  return withUser(app, user, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: user, label: 'Atual' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: user, termId: t!.id, name: 'Patologia' })
      .returning();
    const [l] = await tx
      .insert(s.lessons)
      .values({ ownerId: user, disciplineId: d!.id, title: 'Inflamação', startsAt: new Date() })
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
    const [m] = await tx
      .insert(s.materials)
      .values({ ownerId: user, title: 'Slides' })
      .returning();
    const [v] = await tx
      .insert(s.materialVersions)
      .values({ ownerId: user, materialId: m!.id, fileId: f!.id, version: 1 })
      .returning();
    return { disc: d!.id, lesson: l!.id, material: m!.id, version: v!.id };
  });
}

let ana: string;
let beto: string;
let a: Setup;
let b: Setup;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  a = await setup(ana);
  b = await setup(beto);
  await withUser(app, ana, async (tx) => {
    const [ann] = await tx
      .insert(s.slideAnnotations)
      .values({ ownerId: ana, materialId: a.material, versionId: a.version, page: 1, layer: [] })
      .returning();
    await tx
      .insert(s.slideAnnotationHistory)
      .values({ ownerId: ana, annotationId: ann!.id, revision: 1, layer: [] });
    const [e] = await tx
      .insert(s.notebookEntries)
      .values({
        ownerId: ana,
        disciplineId: a.disc,
        lessonId: a.lesson,
        materialId: a.material,
        versionId: a.version,
        page: 1,
        content: { text: 'Macrófagos na inflamação crônica' },
        plainText: 'Macrófagos na inflamação crônica',
      })
      .returning();
    await tx
      .insert(s.notebookEntryHistory)
      .values({ ownerId: ana, entryId: e!.id, revision: 1, content: { text: '' } });
    await tx.insert(s.contentMarks).values({
      ownerId: ana,
      targetType: 'slide',
      lessonId: a.lesson,
      materialId: a.material,
      versionId: a.version,
      page: 1,
      importance: 'alta',
      difficulty: 'dificil',
    });
    await tx.insert(s.lessonProgress).values({ ownerId: ana, lessonId: a.lesson });
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento (AUL-28)', () => {
  it('outro aluno não lê nada da aula de outro', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      ann: await tx.select().from(s.slideAnnotations),
      annH: await tx.select().from(s.slideAnnotationHistory),
      notes: await tx.select().from(s.notebookEntries),
      notesH: await tx.select().from(s.notebookEntryHistory),
      marks: await tx.select().from(s.contentMarks),
      progress: await tx.select().from(s.lessonProgress),
    }));
    expect(seen).toEqual({ ann: [], annH: [], notes: [], notesH: [], marks: [], progress: [] });
  });

  it('não aponta para material, versão, aula ou disciplina de outro', async () => {
    const tries = [
      () =>
        withUser(app, beto, (tx) =>
          tx
            .insert(s.slideAnnotations)
            .values({ ownerId: beto, materialId: a.material, versionId: a.version, page: 2 }),
        ),
      // Versão de um material com o id de outro material do próprio aluno também não vale.
      () =>
        withUser(app, beto, (tx) =>
          tx
            .insert(s.slideAnnotations)
            .values({ ownerId: beto, materialId: b.material, versionId: a.version, page: 2 }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.notebookEntries).values({
            ownerId: beto,
            disciplineId: a.disc,
            content: { text: 'x' },
          }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.notebookEntries).values({
            ownerId: beto,
            disciplineId: b.disc,
            lessonId: a.lesson,
            content: { text: 'x' },
          }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.contentMarks).values({
            ownerId: beto,
            targetType: 'slide',
            versionId: a.version,
            page: 1,
          }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.lessonProgress).values({ ownerId: beto, lessonId: a.lesson }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.lessonProgress).values({
            ownerId: beto,
            lessonId: b.lesson,
            lastMaterialId: a.material,
          }),
        ),
    ];
    for (const run of tries) expect(pgCode(await run().catch((e) => e))).toBe('42501');
  });
});

describe('regras', () => {
  it('um selo por slide inteiro; o alvo precisa do que o identifica', async () => {
    const dup = await withUser(app, ana, (tx) =>
      tx.insert(s.contentMarks).values({
        ownerId: ana,
        targetType: 'slide',
        materialId: a.material,
        versionId: a.version,
        page: 1,
      }),
    ).catch((e) => e);
    expect(pgCode(dup)).toBe('23505');
    const noRegion = await withUser(app, ana, (tx) =>
      tx.insert(s.contentMarks).values({
        ownerId: ana,
        targetType: 'regiao',
        versionId: a.version,
        page: 1,
      }),
    ).catch((e) => e);
    expect(pgCode(noRegion)).toBe('23514');
  });

  it('uma camada por versão e página', async () => {
    const dup = await withUser(app, ana, (tx) =>
      tx
        .insert(s.slideAnnotations)
        .values({ ownerId: ana, materialId: a.material, versionId: a.version, page: 1 }),
    ).catch((e) => e);
    expect(pgCode(dup)).toBe('23505');
  });

  it('busca no caderno sem acento, e só no do próprio aluno', async () => {
    const q = (user: string) =>
      withUser(app, user, (tx) =>
        tx.execute(
          sql`select id from notebook_entries where search @@ plainto_tsquery('cognuss_pt', 'macrofago cronica')`,
        ),
      );
    expect((await q(ana)).rows).toHaveLength(1);
    expect((await q(beto)).rows).toEqual([]);
  });
});
