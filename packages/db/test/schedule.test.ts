import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Cronograma, avaliações e uso de IA (SPEC v2, 8.2, 8.6 e 7.7; plano, item 41).
const { app, owner, appPool, ownerPool } = connect();
type Tx = Parameters<Parameters<typeof withUser>[2]>[0];
let ana: string;
let beto: string;
let anaDisc: string;
let anaFile: string;
let betoDisc: string;

async function disciplineFor(user: string, name: string) {
  return withUser(app, user, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: user, label: '2026.2' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: user, termId: t!.id, name })
      .returning();
    return d!.id;
  });
}

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  anaDisc = await disciplineFor(ana, 'Fisiopatologia');
  betoDisc = await disciplineFor(beto, 'Anatomia');
  anaFile = await withUser(app, ana, async (tx) => {
    const [f] = await tx
      .insert(s.files)
      .values({
        ownerId: ana,
        originalName: 'cronograma.pdf',
        mime: 'application/pdf',
        sizeBytes: 100,
        sha256: randomBytes(32).toString('hex'),
      })
      .returning();
    await tx.insert(s.lessons).values({
      ownerId: ana,
      disciplineId: anaDisc,
      title: 'Inflamação aguda',
      startsAt: new Date('2026-08-10T11:00:00Z'),
      endsAt: new Date('2026-08-10T13:00:00Z'),
    });
    await tx.insert(s.assessments).values({
      ownerId: ana,
      disciplineId: anaDisc,
      kind: 'prova',
      name: 'P1',
      dueAt: new Date('2026-09-14T11:00:00Z'),
    });
    await tx.insert(s.scheduleImports).values({
      ownerId: ana,
      disciplineId: anaDisc,
      fileId: f!.id,
      referenceYear: 2026,
    });
    await tx.insert(s.aiUsage).values({ ownerId: ana, feature: 'schedule', model: 'x' });
    return f!.id;
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento', () => {
  it('outro aluno não lê aulas, avaliações, importações nem uso de IA', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      lessons: await tx.select().from(s.lessons),
      assessments: await tx.select().from(s.assessments),
      imports: await tx.select().from(s.scheduleImports),
      usage: await tx.select().from(s.aiUsage),
    }));
    expect(seen).toEqual({ lessons: [], assessments: [], imports: [], usage: [] });
  });

  it('não pendura aula, avaliação nem importação na disciplina ou arquivo de outro', async () => {
    const inserts = [
      (tx: Tx) =>
        tx.insert(s.lessons).values({
          ownerId: beto,
          disciplineId: anaDisc,
          title: 'X',
          startsAt: new Date(),
        }),
      (tx: Tx) =>
        tx
          .insert(s.assessments)
          .values({ ownerId: beto, disciplineId: anaDisc, kind: 'prova', name: 'X' }),
      (tx: Tx) =>
        tx
          .insert(s.scheduleImports)
          .values({ ownerId: beto, disciplineId: betoDisc, fileId: anaFile, referenceYear: 2026 }),
      (tx: Tx) => tx.insert(s.aiUsage).values({ ownerId: ana, feature: 'x', model: 'x' }),
    ];
    for (const insert of inserts)
      expect(pgCode(await withUser(app, beto, insert).catch((e) => e))).toBe('42501');
  });

  it('uso de IA não se altera nem se apaga pelo app', async () => {
    for (const run of [
      (tx: Tx) => tx.update(s.aiUsage).set({ costMicros: 0 }).where(eq(s.aiUsage.ownerId, ana)),
      (tx: Tx) => tx.delete(s.aiUsage).where(eq(s.aiUsage.ownerId, ana)),
    ])
      expect(pgCode(await withUser(app, ana, run).catch((e) => e))).toBe('42501');
  });

  it('o admin lê o uso de IA de todos', async () => {
    const admin = await makeUser(owner, ['admin']);
    const rows = await withUser(app, admin, (tx) =>
      tx.select().from(s.aiUsage).where(eq(s.aiUsage.ownerId, ana)),
    );
    expect(rows).toHaveLength(1);
  });

  it('aula termina depois de começar', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx.insert(s.lessons).values({
        ownerId: ana,
        disciplineId: anaDisc,
        title: 'Errada',
        startsAt: new Date('2026-08-10T13:00:00Z'),
        endsAt: new Date('2026-08-10T11:00:00Z'),
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');
  });
});

describe('migração do MVP', () => {
  it('provas do onboarding antigo viram avaliações na disciplina própria, sem duplicar', async () => {
    const aluno = await makeUser(owner);
    const cat = await owner.query.disciplines.findFirst();
    const disc = await withUser(app, aluno, async (tx) => {
      const [t] = await tx
        .insert(s.studentTerms)
        .values({ ownerId: aluno, label: 'Semestre atual' })
        .returning();
      const [d] = await tx
        .insert(s.enrolledDisciplines)
        .values({ ownerId: aluno, termId: t!.id, name: cat!.name, catalogDisciplineId: cat!.id })
        .returning();
      return d!.id;
    });
    const examAt = new Date('2026-10-05T12:00:00Z');
    await owner
      .insert(s.examDates)
      .values({ studentId: aluno, disciplineId: cat!.id, title: 'Prova 1', examAt });
    const file = readFileSync(
      path.join(import.meta.dirname, '../migrations/0027_rls_cronograma.sql'),
      'utf8',
    );
    const backfill = file.split('--> statement-breakpoint').at(-1)!;
    for (let i = 0; i < 2; i++) await owner.execute(sql.raw(backfill));
    const rows = await owner.select().from(s.assessments).where(eq(s.assessments.ownerId, aluno));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      disciplineId: disc,
      kind: 'prova',
      name: 'Prova 1',
      origin: 'manual',
    });
    expect(rows[0]!.dueAt?.toISOString()).toBe(examAt.toISOString());
  });
});
