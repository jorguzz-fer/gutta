import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Material de estudo e busca (SPEC v2, 5.10; ADR 0014; plano, item 52).
const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let anaFile: string;
let anaMaterial: string;
let anaDisc: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  ({ anaFile, anaMaterial, anaDisc } = await withUser(app, ana, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: ana, label: 'Atual' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: ana, termId: t!.id, name: 'Patologia' })
      .returning();
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
    await tx.insert(s.filePages).values({
      fileId: f!.id,
      ownerId: ana,
      page: 3,
      text: 'A inflamação crônica é marcada por infiltrado de macrófagos.',
    });
    const [m] = await tx
      .insert(s.materials)
      .values({ ownerId: ana, title: 'Slides de Inflamação', termId: t!.id })
      .returning();
    await tx
      .insert(s.materialVersions)
      .values({ ownerId: ana, materialId: m!.id, fileId: f!.id, version: 1 });
    await tx
      .insert(s.materialLinks)
      .values({ ownerId: ana, materialId: m!.id, disciplineId: d!.id });
    return { anaFile: f!.id, anaMaterial: m!.id, anaDisc: d!.id };
  }));
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento', () => {
  it('outro aluno não lê materiais, versões nem vínculos', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      m: await tx.select().from(s.materials),
      v: await tx.select().from(s.materialVersions),
      l: await tx.select().from(s.materialLinks),
    }));
    expect(seen).toEqual({ m: [], v: [], l: [] });
  });

  it('não aponta versão para arquivo de outro nem vínculo para disciplina de outro', async () => {
    const [m] = await withUser(app, beto, (tx) =>
      tx.insert(s.materials).values({ ownerId: beto, title: 'Meu' }).returning(),
    );
    for (const run of [
      () =>
        withUser(app, beto, (tx) =>
          tx
            .insert(s.materialVersions)
            .values({ ownerId: beto, materialId: m!.id, fileId: anaFile, version: 1 }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx
            .insert(s.materialLinks)
            .values({ ownerId: beto, materialId: m!.id, disciplineId: anaDisc }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.materialLinks).values({ ownerId: beto, materialId: anaMaterial }),
        ),
    ])
      expect(pgCode(await run().catch((e) => e))).toBe('42501');
  });
});

describe('busca por palavra (ADR 0014)', () => {
  const query = (user: string, q: string) =>
    withUser(app, user, (tx) =>
      tx.execute<{ page: number }>(
        sql`select page from file_pages where search @@ plainto_tsquery('cognuss_pt', ${q})`,
      ),
    );

  it('sem acento e com flexão acha o conteúdo; o título também', async () => {
    expect((await query(ana, 'inflamacao cronica')).rows).toEqual([{ page: 3 }]);
    expect((await query(ana, 'macrofago')).rows).toEqual([{ page: 3 }]);
    const titles = await withUser(app, ana, (tx) =>
      tx.execute(
        sql`select id from materials where search @@ plainto_tsquery('cognuss_pt', 'inflamacao')`,
      ),
    );
    expect(titles.rows).toHaveLength(1);
  });

  it('o aluno B procura um termo que só existe no material de A e não recebe nada', async () => {
    expect((await query(beto, 'inflamacao cronica')).rows).toEqual([]);
  });
});

describe('lixeira', () => {
  it('só o worker apaga o que passou do prazo', async () => {
    await owner
      .update(s.materials)
      .set({ deletedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(s.materials.id, anaMaterial));
    const err = await withUser(app, ana, (tx) => tx.execute(sql`select materials_purge(30)`)).catch(
      (e) => e,
    );
    expect(pgCode(err)).toBe('42501');
    await app.transaction((tx) => tx.execute(sql`select materials_purge(30)`));
    expect(await owner.select().from(s.materials).where(eq(s.materials.id, anaMaterial))).toEqual(
      [],
    );
  });
});
