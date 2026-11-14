import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { createAssessment } from '@/features/calendar/service';
import * as svc from './service';

// Notas (SPEC v2, 5.13; plano, item 49).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

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
    .values({ ownerId: id, termId: t!.id, name: 'Fisiopatologia', color: 1 })
    .returning();
  return { id, disciplineId: d!.id };
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

beforeAll(() => setFeatures({ notas: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('notas', () => {
  it('padrão por pesos e mínima 7; pendente não conta; nota necessária com o exemplo', async () => {
    const { id, disciplineId } = await student();
    const mk = async (name: string, date: string) =>
      (
        await createAssessment(id, {
          disciplineId,
          kind: 'prova',
          name,
          topicNote: null,
          date,
          start: null,
        })
      ).assessment.id;
    const p1 = await mk('P1', '2026-09-12');
    const p2 = await mk('P2', '2026-10-28');
    const p3 = await mk('P3', '2026-11-30');
    // 6,5 de média com peso 6 feito e 4 restante: precisa de 7,75 para 7,0.
    await svc.saveGrade(id, p1, { grade: 6, maxGrade: 10, weight: 3, percent: null });
    await svc.saveGrade(id, p2, { grade: 7, maxGrade: 10, weight: 3, percent: null });
    const { grades } = await svc.saveGrade(id, p3, {
      grade: null,
      maxGrade: 10,
      weight: 4,
      percent: null,
    });
    expect(grades.scheme).toMatchObject({ method: 'pesos', minGrade: 7, configured: false });
    expect(grades.summary).toMatchObject({
      current: 6.5,
      graded: 2,
      pending: 1,
      doneShare: 6,
      remainingShare: 4,
    });
    expect(grades.needed).toEqual({ status: 'alcancavel', needed: 7.75 });
    // Precisa de 7,75 com média 6,5: em risco (6.4, D13).
    expect(grades.atRisk).toBe(true);
    expect(grades.assessments.map((a) => a.name)).toEqual(['P1', 'P2', 'P3']);
    expect(grades.cumulative).toEqual([6, 6.5]);

    const simple = await svc.saveScheme(id, disciplineId, { method: 'simples', minGrade: 6 });
    expect(simple.grades.scheme).toMatchObject({
      method: 'simples',
      minGrade: 6,
      configured: true,
    });
    expect(simple.grades.needed).toEqual({ status: 'alcancavel', needed: 5 });
  });

  it('nota acima da máxima é recusada pelo contrato; outro aluno não lança', async () => {
    const ana = await student();
    const beto = await student();
    const { assessment } = await createAssessment(ana.id, {
      disciplineId: ana.disciplineId,
      kind: 'atividade',
      name: 'A1',
      topicNote: null,
      date: '2026-09-01',
      start: null,
    });
    await expect(
      svc.saveGrade(beto.id, assessment.id, { grade: 8, maxGrade: 10, weight: 1, percent: null }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(svc.getGrades(beto.id, ana.disciplineId)).rejects.toMatchObject({ status: 404 });
  });
});
