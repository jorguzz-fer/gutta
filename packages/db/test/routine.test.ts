import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Rotina semanal (SPEC v2, 5.3; plano, item 43).
const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let anaDisc: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  anaDisc = await withUser(app, ana, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: ana, label: '2026.2' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: ana, termId: t!.id, name: 'Anatomia' })
      .returning();
    await tx.insert(s.routineBlocks).values({
      ownerId: ana,
      kind: 'pessoal',
      category: 'academia',
      label: 'Academia',
      weekdays: [2, 3, 4],
      startMinute: 19 * 60,
      durationMinutes: 60,
    });
    await tx.insert(s.planningPreferences).values({ userId: ana, weeklyGoalMinutes: 900 });
    return d!.id;
  });
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('isolamento', () => {
  it('outro aluno não lê blocos nem preferências', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      blocks: await tx.select().from(s.routineBlocks),
      prefs: await tx.select().from(s.planningPreferences),
    }));
    expect(seen).toEqual({ blocks: [], prefs: [] });
  });

  it('não monta aula na disciplina de outro', async () => {
    const err = await withUser(app, beto, (tx) =>
      tx.insert(s.routineBlocks).values({
        ownerId: beto,
        kind: 'aula',
        label: 'Anatomia',
        disciplineId: anaDisc,
        weekdays: [1],
        startMinute: 480,
        durationMinutes: 120,
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });
});

describe('regras', () => {
  const base = { kind: 'estudo' as const, label: 'Estudo', startMinute: 600, durationMinutes: 60 };
  it('dia da semana de 0 a 6, pelo menos um, e duração de até 24 h', async () => {
    for (const values of [
      { ...base, weekdays: [] as number[] },
      { ...base, weekdays: [7] },
      { ...base, weekdays: [1], durationMinutes: 1500 },
      { ...base, weekdays: [1], startMinute: 1440 },
    ]) {
      const err = await withUser(app, ana, (tx) =>
        tx.insert(s.routineBlocks).values({ ownerId: ana, ...values }),
      ).catch((e) => e);
      expect(pgCode(err)).toBe('23514');
    }
  });

  it('aula exige disciplina, e só aula tem disciplina', async () => {
    for (const values of [
      { ...base, kind: 'aula' as const, weekdays: [1] },
      { ...base, weekdays: [1], disciplineId: anaDisc },
    ]) {
      const err = await withUser(app, ana, (tx) =>
        tx.insert(s.routineBlocks).values({ ownerId: ana, ...values }),
      ).catch((e) => e);
      expect(pgCode(err)).toBe('23514');
    }
  });

  it('meta e grade com valores permitidos', async () => {
    const err = await withUser(app, ana, (tx) =>
      tx
        .update(s.planningPreferences)
        .set({ gridStepMinutes: 20 })
        .where(eq(s.planningPreferences.userId, ana)),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('23514');
  });

  it('apagar a disciplina leva a aula montada à mão', async () => {
    const id = await withUser(app, ana, async (tx) => {
      const [t] = await tx.select().from(s.studentTerms).limit(1);
      const [d] = await tx
        .insert(s.enrolledDisciplines)
        .values({ ownerId: ana, termId: t!.id, name: 'Temporária' })
        .returning();
      await tx.insert(s.routineBlocks).values({
        ownerId: ana,
        kind: 'aula',
        label: 'Temporária',
        disciplineId: d!.id,
        weekdays: [1],
        startMinute: 480,
        durationMinutes: 60,
      });
      await tx.delete(s.enrolledDisciplines).where(eq(s.enrolledDisciplines.id, d!.id));
      return d!.id;
    });
    expect(
      await owner.select().from(s.routineBlocks).where(eq(s.routineBlocks.disciplineId, id)),
    ).toHaveLength(0);
  });
});
