import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withAnonymous, withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, courseId, makeUser, pgCode } from './helpers';

// SPEC §13.2 e §17.1: duas contas não leem nem alteram dados privados uma da outra.
const { app, owner, appPool, ownerPool } = connect();
let alice: string;
let bruno: string;
let medicina: string;

beforeAll(async () => {
  alice = await makeUser(owner);
  bruno = await makeUser(owner);
  medicina = await courseId(owner);
  await withUser(app, alice, (tx) =>
    tx.insert(s.studentProfiles).values({ userId: alice, courseId: medicina, semester: 3 }),
  );
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('papel da aplicação', () => {
  it('gutta_app não ignora RLS e não é dono das tabelas', async () => {
    const r = await app.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    expect(r.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const owners = await app.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(owners.rows[0]!.n).toBe(0);
  });

  it('tabelas do aluno têm RLS ativo e forçado', async () => {
    const r = await app.execute<{ relname: string; on: boolean; forced: boolean }>(sql`
      select relname, relrowsecurity as on, relforcerowsecurity as forced from pg_class
      where relname in ('profiles','student_profiles','student_disciplines','exam_dates',
                        'consent_records','data_requests','role_assignments','audit_logs','product_events')`);
    expect(r.rows).toHaveLength(9);
    for (const row of r.rows)
      expect([row.relname, row.on, row.forced]).toEqual([row.relname, true, true]);
  });
});

describe('isolamento entre alunos', () => {
  it('sem usuário no contexto, nada privado aparece', async () => {
    const rows = await withAnonymous(app, (tx) => tx.select().from(s.studentProfiles));
    expect(rows).toHaveLength(0);
    const direct = await app.select().from(s.studentProfiles);
    expect(direct).toHaveLength(0);
  });

  it('aluno lê o próprio perfil e não o de outro', async () => {
    const own = await withUser(app, alice, (tx) => tx.select().from(s.studentProfiles));
    expect(own.map((r) => r.userId)).toEqual([alice]);
    const other = await withUser(app, bruno, (tx) =>
      tx.select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, alice)),
    );
    expect(other).toHaveLength(0);
  });

  it('aluno não altera nem apaga dados de outro', async () => {
    const updated = await withUser(app, bruno, (tx) =>
      tx
        .update(s.studentProfiles)
        .set({ semester: 9 })
        .where(eq(s.studentProfiles.userId, alice))
        .returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await withUser(app, bruno, (tx) =>
      tx.delete(s.studentProfiles).where(eq(s.studentProfiles.userId, alice)).returning(),
    );
    expect(deleted).toHaveLength(0);
    const still = await owner.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, alice),
    });
    expect(still?.semester).toBe(3);
  });

  it('aluno não cria registro em nome de outro', async () => {
    const err = await withUser(app, bruno, (tx) =>
      tx.insert(s.examDates).values({
        studentId: alice,
        disciplineId: sql`(select id from disciplines limit 1)`,
        title: 'Prova falsa',
        examAt: new Date(),
      }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('o contexto não vaza para a próxima transação na mesma conexão', async () => {
    await withUser(app, alice, (tx) => tx.select().from(s.studentProfiles));
    const after = await app.execute<{ uid: string | null }>(sql`select app_user_id() as uid`);
    expect(after.rows[0]!.uid).toBeNull();
  });

  it('perfil público (profiles) também é isolado', async () => {
    const rows = await withUser(app, bruno, (tx) =>
      tx.select().from(s.profiles).where(eq(s.profiles.userId, alice)),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('papéis e auditoria', () => {
  it('aluno não se promove a admin', async () => {
    const err = await withUser(app, alice, (tx) =>
      tx.insert(s.roleAssignments).values({ userId: alice, role: 'admin' }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('admin atribui papel; aluno só vê os próprios papéis', async () => {
    const admin = await makeUser(owner, ['admin']);
    await withUser(app, admin, (tx) =>
      tx.insert(s.roleAssignments).values({ userId: bruno, role: 'editor', grantedBy: admin }),
    );
    const seenByAlice = await withUser(app, alice, (tx) => tx.select().from(s.roleAssignments));
    expect(seenByAlice).toHaveLength(0);
    const seenByBruno = await withUser(app, bruno, (tx) => tx.select().from(s.roleAssignments));
    expect(seenByBruno.map((r) => r.role)).toEqual(['editor']);
  });

  it('auditoria: não grava em nome de outro, aluno não lê, ninguém altera', async () => {
    const forged = await withUser(app, alice, (tx) =>
      tx.insert(s.auditLogs).values({ actorId: bruno, action: 'x', entityType: 'y' }),
    ).catch((e) => e);
    expect(pgCode(forged)).toBe('42501');
    await withUser(app, alice, (tx) =>
      tx.insert(s.auditLogs).values({ actorId: alice, action: 'teste', entityType: 'teste' }),
    );
    const read = await withUser(app, alice, (tx) => tx.select().from(s.auditLogs));
    expect(read).toHaveLength(0);
    const upd = await withUser(app, alice, (tx) =>
      tx.update(s.auditLogs).set({ action: 'apagado' }).where(eq(s.auditLogs.actorId, alice)),
    ).catch((e) => e);
    expect(pgCode(upd)).toBe('42501');
  });

  it('consentimentos são só de inserção', async () => {
    await withUser(app, alice, (tx) =>
      tx.insert(s.consentRecords).values({
        userId: alice,
        purpose: 'marketing',
        granted: true,
        policyVersion: 'teste',
      }),
    );
    const err = await withUser(app, alice, (tx) =>
      tx
        .update(s.consentRecords)
        .set({ granted: false })
        .where(and(eq(s.consentRecords.userId, alice))),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });
});

describe('catálogo e workflow editorial', () => {
  async function draftModule(author: string, slug: string) {
    const disc = await owner.query.disciplines.findFirst();
    const topic = await owner.query.topics.findFirst({
      where: eq(s.topics.disciplineId, disc!.id),
    });
    const [m] = await withUser(app, author, (tx) =>
      tx
        .insert(s.modules)
        .values({
          disciplineId: disc!.id,
          topicId: topic!.id,
          slug,
          title: 'Rascunho',
          authorId: author,
        })
        .returning(),
    );
    return m!.id;
  }

  it('aluno e visitante só veem módulos publicados', async () => {
    const editor = await makeUser(owner, ['editor']);
    const id = await draftModule(editor, `rascunho-${Date.now()}`);
    const anon = await withAnonymous(app, (tx) =>
      tx.select().from(s.modules).where(eq(s.modules.id, id)),
    );
    expect(anon).toHaveLength(0);
    const student = await withUser(app, alice, (tx) =>
      tx.select().from(s.modules).where(eq(s.modules.id, id)),
    );
    expect(student).toHaveLength(0);
    const published = await withAnonymous(app, (tx) =>
      tx.select().from(s.modules).where(eq(s.modules.status, 'published')),
    );
    expect(published.length).toBeGreaterThan(0);
    const asEditor = await withUser(app, editor, (tx) =>
      tx.select().from(s.modules).where(eq(s.modules.id, id)),
    );
    expect(asEditor).toHaveLength(1);
  });

  it('aluno não cria conteúdo editorial', async () => {
    const err = await draftModule(alice, `aluno-${Date.now()}`).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
  });

  it('editor não publica sem revisão, autor não aprova o próprio, revisor publica', async () => {
    const editor = await makeUser(owner, ['editor']);
    const reviewer = await makeUser(owner, ['reviewer']);
    const id = await draftModule(editor, `fluxo-${Date.now()}`);
    const setStatus = (who: string, status: (typeof s.contentStatus.enumValues)[number]) =>
      withUser(app, who, (tx) =>
        tx.update(s.modules).set({ status }).where(eq(s.modules.id, id)).returning(),
      );

    expect(pgCode(await setStatus(editor, 'published').catch((e) => e))).toBe('23514');
    await setStatus(editor, 'in_review');
    expect(pgCode(await setStatus(editor, 'approved').catch((e) => e))).toBe('42501');

    const selfReviewer = await makeUser(owner, ['editor', 'reviewer']);
    const own = await draftModule(selfReviewer, `proprio-${Date.now()}`);
    await withUser(app, selfReviewer, (tx) =>
      tx.update(s.modules).set({ status: 'in_review' }).where(eq(s.modules.id, own)),
    );
    const selfApprove = await withUser(app, selfReviewer, (tx) =>
      tx.update(s.modules).set({ status: 'approved' }).where(eq(s.modules.id, own)),
    ).catch((e) => e);
    expect(pgCode(selfApprove)).toBe('42501');

    const [approved] = await setStatus(reviewer, 'approved');
    expect(approved!.reviewerId).toBe(reviewer);
    const [published] = await setStatus(reviewer, 'published');
    expect(published!.publishedAt).toBeInstanceOf(Date);

    const editPublished = await withUser(app, editor, (tx) =>
      tx.update(s.modules).set({ title: 'Mudança escondida' }).where(eq(s.modules.id, id)),
    ).catch((e) => e);
    expect(pgCode(editPublished)).toBe('42501');
  });

  it('aluno sugere instituição como pendente e não ativa', async () => {
    const name = `Faculdade Teste ${Date.now()}`;
    const active = await withUser(app, alice, (tx) =>
      tx.insert(s.institutions).values({ name, status: 'active', suggestedBy: alice }),
    ).catch((e) => e);
    expect(pgCode(active)).toBe('42501');
    await withUser(app, alice, (tx) =>
      tx.insert(s.institutions).values({ name, status: 'pending', suggestedBy: alice }),
    );
    const otherStudent = await makeUser(owner);
    const seenByOther = await withUser(app, otherStudent, (tx) =>
      tx.select().from(s.institutions).where(eq(s.institutions.name, name)),
    );
    expect(seenByOther).toHaveLength(0);
  });
});
