import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CurrentUser, Role } from '@/lib/auth/session';
import * as svc from './service';

/*
  Admin da empresa: o serviço faz CRUD do catálogo, instituições e papéis, e o banco (RLS)
  recusa quem não é admin mesmo que a tela falhe. Cada mudança vira auditoria.
*/
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
let admin: CurrentUser;
let editor: CurrentUser;
let student: CurrentUser;

async function user(roles: Role[] = []): Promise<CurrentUser> {
  const id = randomUUID();
  await owner.insert(s.authUsers).values({
    id,
    name: `Teste ${id.slice(0, 4)}`,
    email: `${id}@teste.gutta`,
    emailVerified: false,
  });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return { id, name: 'Teste', email: `${id}@teste.gutta`, twoFactorEnabled: true, roles };
}

beforeAll(async () => {
  admin = await user(['admin']);
  editor = await user(['editor']);
  student = await user();
});
afterAll(async () => {
  await ownerPool.end();
});

describe('admin: catálogo', () => {
  it('cria curso, disciplina, assunto e módulo, com auditoria', async () => {
    const tag = randomUUID().slice(0, 6);
    const course = await svc.saveCourse(admin, null, { name: `Enfermagem ${tag}`, active: 'on' });
    expect(course.slug).toBe(`enfermagem-${tag}`);
    const disc = await svc.saveDiscipline(
      admin,
      { courseId: course.id },
      { name: 'Anatomia Básica', periodHint: '1', active: 'on' },
    );
    const topic = await svc.saveTopic(
      admin,
      { disciplineId: disc.id },
      { name: 'Sistema esquelético' },
    );
    const mod = await svc.saveModule(
      admin,
      { disciplineId: disc.id },
      { title: 'Ossos do crânio', topicId: topic.id },
    );
    expect(mod.status).toBe('draft');
    expect(mod.isDemo).toBe(false);
    const logs = await owner.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, mod.id));
    expect(logs.map((l) => l.action)).toContain('module.created');
  });

  it('o autor não aprova o próprio módulo (trigger editorial)', async () => {
    const course = await svc.saveCourse(admin, null, { name: `Curso ${randomUUID().slice(0, 6)}` });
    const disc = await svc.saveDiscipline(admin, { courseId: course.id }, { name: 'Disciplina X' });
    const topic = await svc.saveTopic(admin, { disciplineId: disc.id }, { name: 'Assunto X' });
    const mod = await svc.saveModule(
      admin,
      { disciplineId: disc.id },
      { title: 'Módulo X', topicId: topic.id },
    );
    await svc.transitionModule(admin, mod.id, { to: 'in_review' });
    await expect(svc.transitionModule(admin, mod.id, { to: 'approved' })).rejects.toThrow(
      /autor não aprova/,
    );
    await expect(svc.transitionModule(admin, mod.id, { to: 'published' })).rejects.toThrow();
  });

  it('quem não é admin não cria curso, mesmo chamando o serviço direto (RLS)', async () => {
    await expect(svc.saveCourse(editor, null, { name: 'Curso pirata' })).rejects.toMatchObject({
      status: 403,
    });
    await expect(svc.saveCourse(student, null, { name: 'Curso pirata 2' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('assunto em uso por questões não é excluído', async () => {
    const q = await owner.query.questions.findFirst();
    await expect(svc.deleteTopic(admin, q!.topicId)).rejects.toMatchObject({ status: 409 });
  });
});

describe('admin: instituições e usuários', () => {
  it('aprova instituição pendente; aluno não consegue', async () => {
    const [inst] = await owner
      .insert(s.institutions)
      .values({ name: `Faculdade ${randomUUID()}`, status: 'pending', suggestedBy: student.id })
      .returning();
    await expect(svc.setInstitutionStatus(student, inst!.id, 'active')).rejects.toThrow();
    const row = await svc.setInstitutionStatus(admin, inst!.id, 'active');
    expect(row.status).toBe('active');
  });

  it('dá e tira papel, confirma e-mail e não deixa o admin se rebaixar', async () => {
    await svc.setRole(admin, student.id, 'teacher', true);
    let roles = await owner
      .select()
      .from(s.roleAssignments)
      .where(eq(s.roleAssignments.userId, student.id));
    expect(roles.map((r) => r.role)).toEqual(['teacher']);
    await svc.setRole(admin, student.id, 'teacher', false);
    roles = await owner
      .select()
      .from(s.roleAssignments)
      .where(eq(s.roleAssignments.userId, student.id));
    expect(roles).toHaveLength(0);
    await expect(svc.setRole(admin, admin.id, 'admin', false)).rejects.toMatchObject({
      status: 409,
    });
    await expect(svc.setRole(editor, student.id, 'admin', true)).rejects.toThrow();

    await svc.verifyEmail(admin, student.id);
    const u = await owner.query.authUsers.findFirst({ where: eq(s.authUsers.id, student.id) });
    expect(u!.emailVerified).toBe(true);
  });

  it('a lista de usuários traz os papéis', async () => {
    const rows = await svc.listUsers(admin, { q: admin.email });
    expect(rows[0]!.roles).toEqual(['admin']);
  });
});
