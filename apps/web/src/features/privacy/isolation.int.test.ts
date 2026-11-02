import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDashboard } from '@/features/dashboard/data';
import { nextQuestion, recentSessions } from '@/features/questions/service';
import { getRoles } from '@/lib/auth/session';
import { currentConsents, exportData } from './service';

/*
  Regressão: admin e revisor leem dados de todos pelo RLS (métricas, estatística de questão).
  As telas pessoais deles não podem mostrar dados de outros alunos, então todo serviço filtra
  pelo dono além do RLS (defesa em profundidade, blueprint §7).
*/
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
let student: string;
let admin: string;
let reviewer: string;
let studentSession: string;

async function user(roles: (typeof s.appRole.enumValues)[number][] = []) {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return id;
}

beforeAll(async () => {
  student = await user();
  admin = await user(['admin']);
  reviewer = await user(['reviewer']);
  const course = await owner.query.courses.findFirst({ where: eq(s.courses.slug, 'medicina') });
  const discipline = await owner.query.disciplines.findFirst({
    where: eq(s.disciplines.courseId, course!.id),
  });
  for (const id of [student, admin, reviewer]) {
    await owner
      .insert(s.studentProfiles)
      .values({ userId: id, courseId: course!.id, semester: 3, onboardingCompletedAt: new Date() });
    await owner
      .insert(s.studentDisciplines)
      .values({ studentId: id, disciplineId: discipline!.id });
  }
  await owner
    .insert(s.consentRecords)
    .values({ userId: student, purpose: 'marketing', granted: true, policyVersion: 't' });
  const q = await owner.query.questions.findFirst({ where: eq(s.questions.status, 'published') });
  const opt = await owner.query.questionOptions.findFirst({
    where: eq(s.questionOptions.questionId, q!.id),
  });
  const [sess] = await owner
    .insert(s.questionSessions)
    .values({ studentId: student, algorithmVersion: 't', targetCount: 5 })
    .returning();
  studentSession = sess!.id;
  await owner.insert(s.questionAttempts).values({
    sessionId: sess!.id,
    questionId: q!.id,
    studentId: student,
    selectedOptionId: opt!.id,
    clientAttemptKey: randomUUID(),
  });
  await owner
    .insert(s.productEvents)
    .values({ actorId: student, eventName: 'question_answered', properties: {} });
});

afterAll(async () => {
  await ownerPool.end();
});

describe('telas pessoais de admin e revisor só mostram os próprios dados', () => {
  it('papéis: só os do próprio usuário', async () => {
    expect(await getRoles(admin)).toEqual(['admin']);
    expect(await getRoles(student)).toEqual([]);
  });

  it('exportação do admin não leva dados de outros alunos', async () => {
    const data = await exportData(admin);
    expect(data.profile?.userId).toBe(admin);
    expect(data.questionAttempts).toHaveLength(0);
    expect(data.questionSessions).toHaveLength(0);
    expect(data.consents.every((c) => c.userId === admin)).toBe(true);
    expect(data.productEvents.every((e) => e.actorId === admin)).toBe(true);
    const asReviewer = await exportData(reviewer);
    expect(asReviewer.questionAttempts).toHaveLength(0);
  });

  it('consentimentos, histórico e sessões são do próprio usuário', async () => {
    expect((await currentConsents(admin)).latest.marketing).toBeUndefined();
    expect(await recentSessions(admin)).toHaveLength(0);
    await expect(nextQuestion(admin, studentSession)).rejects.toMatchObject({ status: 404 });
    const own = await recentSessions(student);
    expect(own.map((r) => r.id)).toContain(studentSession);
  });

  it('o painel do revisor não conta as respostas de outro aluno', async () => {
    const d = await loadDashboard(reviewer);
    expect(d.week.questions).toBe(0);
    expect(d.isNew).toBe(true);
    const ds = await loadDashboard(student);
    expect(ds.week.questions).toBe(1);
  });
});
