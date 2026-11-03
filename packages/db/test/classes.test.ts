import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

/*
  Painel do professor: o professor vê agregados só das turmas dele, só de alunos que entraram
  pelo código, e só do que fizeram depois de entrar. Aluno não lê dados de colega.
*/
const { app, owner, appPool, ownerPool } = connect();
let prof: string;
let outroProf: string;
let aluno: string;
let colega: string;
let classId: string;
let code: string;
let question: { id: string; right: string; wrong: string };

async function attempt(student: string, option: string, at?: Date) {
  const [sess] = await owner
    .insert(s.questionSessions)
    .values({ studentId: student, algorithmVersion: 'teste', targetCount: 1 })
    .returning();
  await owner.insert(s.questionAttempts).values({
    sessionId: sess!.id,
    questionId: question.id,
    studentId: student,
    selectedOptionId: option,
    clientAttemptKey: randomUUID(),
    answeredAt: at ?? new Date(),
  });
}

const stats = (user: string, cid: string) =>
  withUser(app, user, (tx) =>
    tx.execute<{ student_id: string; attempts: number; correct: number }>(
      sql`select * from class_student_stats(${cid})`,
    ),
  );

beforeAll(async () => {
  prof = await makeUser(owner, ['teacher']);
  outroProf = await makeUser(owner, ['teacher']);
  aluno = await makeUser(owner);
  colega = await makeUser(owner);
  const q = await owner.query.questions.findFirst({ where: eq(s.questions.status, 'published') });
  const opts = await owner
    .select()
    .from(s.questionOptions)
    .where(eq(s.questionOptions.questionId, q!.id));
  question = {
    id: q!.id,
    right: opts.find((o) => o.isCorrect)!.id,
    wrong: opts.find((o) => !o.isCorrect)!.id,
  };
  code = `T${randomUUID().slice(0, 7).toUpperCase()}`;
  const [c] = await withUser(app, prof, (tx) =>
    tx.insert(s.classes).values({ teacherId: prof, name: 'Turma A', joinCode: code }).returning(),
  );
  classId = c!.id;
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('turmas', () => {
  it('quem não é professor não cria turma, nem em nome de outro', async () => {
    const err = await withUser(app, aluno, (tx) =>
      tx.insert(s.classes).values({ teacherId: aluno, name: 'X', joinCode: `X${Date.now()}` }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    const err2 = await withUser(app, outroProf, (tx) =>
      tx.insert(s.classes).values({ teacherId: prof, name: 'Y', joinCode: `Y${Date.now()}` }),
    ).catch((e) => e);
    expect(pgCode(err2)).toBe('42501');
  });

  it('aluno entra pelo código e só conta o que fez depois de entrar', async () => {
    await attempt(aluno, question.wrong, new Date(Date.now() - 86_400_000));
    await withUser(app, aluno, (tx) => tx.execute(sql`select join_class(${code.toLowerCase()})`));
    await attempt(aluno, question.right);
    await attempt(aluno, question.wrong);
    const rows = (await stats(prof, classId)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: aluno, attempts: 2, correct: 1 });
  });

  it('código errado não revela nada', async () => {
    const err = await withUser(app, aluno, (tx) =>
      tx.execute(sql`select join_class('NAOEXISTE')`),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('P0002');
  });

  it('outro professor, aluno e colega não leem os dados da turma', async () => {
    for (const u of [outroProf, aluno, colega]) {
      const err = await stats(u, classId).catch((e) => e);
      expect(pgCode(err)).toBe('42501');
    }
    const seen = await withUser(app, outroProf, (tx) =>
      tx.select().from(s.classMembers).where(eq(s.classMembers.classId, classId)),
    );
    expect(seen).toHaveLength(0);
  });

  it('o aluno não se coloca em turma sem código nem muda a data de entrada', async () => {
    const err = await withUser(app, colega, (tx) =>
      tx.insert(s.classMembers).values({ classId, studentId: colega }),
    ).catch((e) => e);
    expect(pgCode(err)).toBe('42501');
    const upd = await withUser(app, aluno, (tx) =>
      tx
        .update(s.classMembers)
        .set({ joinedAt: new Date(0) })
        .where(and(eq(s.classMembers.classId, classId), eq(s.classMembers.studentId, aluno)))
        .returning(),
    );
    expect(upd).toHaveLength(0);
  });

  it('ao sair, o aluno some do painel do professor', async () => {
    await withUser(app, aluno, (tx) => tx.execute(sql`select leave_class(${classId})`));
    expect((await stats(prof, classId)).rows).toHaveLength(0);
    const mine = await withUser(app, aluno, (tx) =>
      tx.select().from(s.classes).where(eq(s.classes.id, classId)),
    );
    expect(mine).toHaveLength(0);
  });
});
