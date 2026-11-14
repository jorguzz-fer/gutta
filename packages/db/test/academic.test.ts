import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Vida acadêmica (SPEC v2, 8.1; plano, item 38): cada aluno só vê e altera o que é dele.
const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let anaTerm: string;
let anaDisc: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  await withUser(app, ana, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: ana, label: '2026.2' })
      .returning();
    anaTerm = t!.id;
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({
        ownerId: ana,
        termId: anaTerm,
        name: 'Fisiopatologia',
        shortName: 'Fisiopato',
        color: 1,
      })
      .returning();
    anaDisc = d!.id;
    await tx
      .insert(s.disciplineTeachers)
      .values({ ownerId: ana, disciplineId: anaDisc, name: 'Dra. Juliana' });
    await tx
      .insert(s.disciplineTopics)
      .values({ ownerId: ana, disciplineId: anaDisc, name: 'Inflamação aguda' });
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento', () => {
  it('outro aluno não lê semestre, disciplina, docente nem tema', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      terms: await tx.select().from(s.studentTerms).where(eq(s.studentTerms.ownerId, ana)),
      discs: await tx.select().from(s.enrolledDisciplines),
      teachers: await tx.select().from(s.disciplineTeachers),
      topics: await tx.select().from(s.disciplineTopics),
    }));
    expect(seen).toEqual({ terms: [], discs: [], teachers: [], topics: [] });
  });

  it('outro aluno não pendura disciplina no semestre de quem não é ele', async () => {
    const err = await withUser(app, beto, (tx) =>
      tx.insert(s.enrolledDisciplines).values({ ownerId: beto, termId: anaTerm, name: 'Intrusa' }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('nem docente ou tema na disciplina de outro', async () => {
    for (const insert of [
      (tx: Parameters<Parameters<typeof withUser>[2]>[0]) =>
        tx.insert(s.disciplineTeachers).values({ ownerId: beto, disciplineId: anaDisc, name: 'X' }),
      (tx: Parameters<Parameters<typeof withUser>[2]>[0]) =>
        tx.insert(s.disciplineTopics).values({ ownerId: beto, disciplineId: anaDisc, name: 'X' }),
    ]) {
      expect(pgCode(await withUser(app, beto, insert).catch((e) => e))).toBe('42501');
    }
  });

  it('outro aluno não altera nem apaga', async () => {
    await withUser(app, beto, async (tx) => {
      await tx
        .update(s.enrolledDisciplines)
        .set({ name: 'Trocado' })
        .where(eq(s.enrolledDisciplines.id, anaDisc));
      await tx.delete(s.disciplineTopics).where(eq(s.disciplineTopics.disciplineId, anaDisc));
    });
    const d = await owner.query.enrolledDisciplines.findFirst({
      where: eq(s.enrolledDisciplines.id, anaDisc),
    });
    expect(d?.name).toBe('Fisiopatologia');
    expect(
      await owner
        .select()
        .from(s.disciplineTopics)
        .where(eq(s.disciplineTopics.disciplineId, anaDisc)),
    ).toHaveLength(1);
  });
});

describe('regras', () => {
  it('um semestre atual por aluno', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx.insert(s.studentTerms).values({ ownerId: ana, label: 'Outro', isCurrent: true }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23505');
  });

  it('cor de 1 a 8 e nome sem repetir no semestre', async () => {
    const color = await withUser(app, ana, (tx) =>
      tx
        .insert(s.enrolledDisciplines)
        .values({ ownerId: ana, termId: anaTerm, name: 'Anatomia', color: 9 }),
    ).catch((e) => e);
    expect(pgCode(color)).toBe('23514');
    const dup = await withUser(app, ana, (tx) =>
      tx
        .insert(s.enrolledDisciplines)
        .values({ ownerId: ana, termId: anaTerm, name: 'fisiopatologia' }),
    ).catch((e) => e);
    expect(pgCode(dup)).toBe('23505');
  });

  it('apagar a disciplina leva docentes e temas junto', async () => {
    const id = await withUser(app, ana, async (tx) => {
      const [d] = await tx
        .insert(s.enrolledDisciplines)
        .values({ ownerId: ana, termId: anaTerm, name: 'Temporária' })
        .returning();
      await tx
        .insert(s.disciplineTeachers)
        .values({ ownerId: ana, disciplineId: d!.id, name: 'Prof. X' });
      await tx.delete(s.enrolledDisciplines).where(eq(s.enrolledDisciplines.id, d!.id));
      return d!.id;
    });
    expect(
      await owner
        .select()
        .from(s.disciplineTeachers)
        .where(eq(s.disciplineTeachers.disciplineId, id)),
    ).toHaveLength(0);
  });
});

describe('migração do MVP', () => {
  it('cria o semestre atual e as disciplinas a partir do catálogo, sem duplicar', async () => {
    const aluno = await makeUser(owner);
    const cat = await owner.query.disciplines.findMany({ limit: 2 });
    for (const d of cat)
      await owner.insert(s.studentDisciplines).values({ studentId: aluno, disciplineId: d.id });
    // Os dois INSERT do fim da migration 0021, rodados de novo (a migration já rodou antes de
    // existir este aluno).
    const file = readFileSync(
      path.join(import.meta.dirname, '../migrations/0021_rls_academico.sql'),
      'utf8',
    );
    const backfill = file.split('--> statement-breakpoint').slice(-2);
    for (let i = 0; i < 2; i++) for (const stmt of backfill) await owner.execute(sql.raw(stmt));
    const terms = await owner
      .select()
      .from(s.studentTerms)
      .where(eq(s.studentTerms.ownerId, aluno));
    expect(terms).toHaveLength(1);
    const discs = await owner
      .select()
      .from(s.enrolledDisciplines)
      .where(
        and(
          eq(s.enrolledDisciplines.ownerId, aluno),
          eq(s.enrolledDisciplines.termId, terms[0]!.id),
        ),
      );
    expect(discs.map((d) => d.catalogDisciplineId).sort()).toEqual(cat.map((d) => d.id).sort());
    expect(new Set(discs.map((d) => d.color)).size).toBe(discs.length);
  });
});
