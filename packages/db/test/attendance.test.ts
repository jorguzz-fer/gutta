import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Faltas (SPEC v2, 5.12; plano, item 48).
const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let disc: string;
let lesson: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  ({ disc, lesson } = await withUser(app, ana, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: ana, label: 'Atual' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: ana, termId: t!.id, name: 'Fisiopatologia' })
      .returning();
    const [l] = await tx
      .insert(s.lessons)
      .values({
        ownerId: ana,
        disciplineId: d!.id,
        title: 'Aula',
        startsAt: new Date('2026-08-10T11:00:00Z'),
      })
      .returning();
    await tx.insert(s.attendanceRules).values({
      ownerId: ana,
      disciplineId: d!.id,
      totalClassHours: '80',
      minAttendancePct: '75',
    });
    await tx.insert(s.absences).values({
      ownerId: ana,
      disciplineId: d!.id,
      lessonId: l!.id,
      date: '2026-08-10',
      classHours: '2',
    });
    return { disc: d!.id, lesson: l!.id };
  }));
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('faltas', () => {
  it('outro aluno não lê nem registra na disciplina ou aula de outro', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      r: await tx.select().from(s.attendanceRules),
      a: await tx.select().from(s.absences),
    }));
    expect(seen).toEqual({ r: [], a: [] });
    const err = await withUser(app, beto, (tx) =>
      tx
        .insert(s.absences)
        .values({ ownerId: beto, disciplineId: disc, date: '2026-08-12', classHours: '2' }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('um registro por aula; sem aula, um por dia', async () => {
    const dup = await withUser(app, ana, (tx) =>
      tx.insert(s.absences).values({
        ownerId: ana,
        disciplineId: disc,
        lessonId: lesson,
        date: '2026-08-10',
        classHours: '1',
      }),
    ).catch((e) => e);
    expect(pgCode(dup)).toBe('23505');
    await withUser(app, ana, (tx) =>
      tx
        .insert(s.absences)
        .values({ ownerId: ana, disciplineId: disc, date: '2026-08-12', classHours: '2' }),
    );
    const day = await withUser(app, ana, (tx) =>
      tx
        .insert(s.absences)
        .values({ ownerId: ana, disciplineId: disc, date: '2026-08-12', classHours: '1' }),
    ).catch((e) => e);
    expect(pgCode(day)).toBe('23505');
  });

  it('a falta fica quando a aula some (FAL-12)', async () => {
    await owner.delete(s.lessons);
    const rows = await owner.select().from(s.absences);
    expect(rows.find((r) => r.date === '2026-08-10')?.lessonId).toBeNull();
  });
});
