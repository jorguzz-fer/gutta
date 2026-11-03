import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, isNull, schema as s, sql, withUser } from '@gutta/db';
import { z } from 'zod';
import { ApiError, notFound } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/events';

/*
  Turmas (painel do professor, roadmap F2). O professor lê só agregados, pelas funções
  class_* do banco (migration 0011), que conferem se a turma é dele e contam só o que o aluno
  fez depois de entrar. Aqui não há consulta direta às tentativas de outra pessoa.
*/

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I/L, que confundem
export function newJoinCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export const classInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome à turma.').max(120),
  disciplineId: z
    .union([z.literal(''), z.uuid()])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
});
export const joinInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,12}$/, 'O código tem letras e números, como K7Q2MP.'),
});

function pgCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

// ── Professor ────────────────────────────────────────────────────────────

export async function listTeacherClasses(teacher: CurrentUser) {
  return withUser(db(), teacher.id, (tx) =>
    tx
      .select({
        id: s.classes.id,
        name: s.classes.name,
        joinCode: s.classes.joinCode,
        active: s.classes.active,
        createdAt: s.classes.createdAt,
        disciplineName: s.disciplines.name,
        members: sql<number>`(select count(*)::int from class_members m where m.class_id = "classes"."id" and m.left_at is null)`,
      })
      .from(s.classes)
      .leftJoin(s.disciplines, eq(s.disciplines.id, s.classes.disciplineId))
      // Filtro explícito: admin lê todas pelo RLS, mas aqui são só as dele.
      .where(eq(s.classes.teacherId, teacher.id))
      .orderBy(desc(s.classes.active), desc(s.classes.createdAt)),
  );
}

export async function teacherDisciplines(teacher: CurrentUser) {
  return withUser(db(), teacher.id, (tx) =>
    tx
      .select({ id: s.disciplines.id, name: s.disciplines.name, courseName: s.courses.name })
      .from(s.disciplines)
      .innerJoin(s.courses, eq(s.courses.id, s.disciplines.courseId))
      .where(eq(s.disciplines.active, true))
      .orderBy(asc(s.courses.name), asc(s.disciplines.name)),
  );
}

export async function createClass(teacher: CurrentUser, raw: unknown) {
  const v = classInput.parse(raw);
  return withUser(db(), teacher.id, async (tx) => {
    for (let i = 0; i < 5; i++) {
      const joinCode = newJoinCode();
      const clash = await tx.execute(sql`select 1 from classes where join_code = ${joinCode}`);
      if (clash.rows.length) continue;
      const [row] = await tx
        .insert(s.classes)
        .values({ teacherId: teacher.id, name: v.name, disciplineId: v.disciplineId, joinCode })
        .returning();
      await audit(
        tx,
        teacher.id,
        'class.created',
        { type: 'class', id: row!.id },
        { name: v.name },
      );
      return row!;
    }
    throw new ApiError(503, 'retry', 'Não deu para gerar um código agora. Tente de novo.');
  });
}

async function ownClass(teacher: CurrentUser, id: string) {
  return withUser(db(), teacher.id, async (tx) => {
    const row = await tx.query.classes.findFirst({
      where: and(eq(s.classes.id, id), eq(s.classes.teacherId, teacher.id)),
    });
    if (!row) throw notFound('Turma');
    return row;
  });
}

export async function updateClass(
  teacher: CurrentUser,
  id: string,
  change: { active?: boolean; newCode?: boolean; name?: string },
) {
  await ownClass(teacher, id);
  return withUser(db(), teacher.id, async (tx) => {
    const set: Partial<typeof s.classes.$inferInsert> = {};
    if (change.active !== undefined) set.active = change.active;
    if (change.newCode) set.joinCode = newJoinCode();
    if (change.name) set.name = classInput.shape.name.parse(change.name);
    const [row] = await tx
      .update(s.classes)
      .set(set)
      .where(and(eq(s.classes.id, id), eq(s.classes.teacherId, teacher.id)))
      .returning();
    await audit(
      tx,
      teacher.id,
      'class.updated',
      { type: 'class', id },
      {
        active: change.active,
        newCode: Boolean(change.newCode),
      },
    );
    return row!;
  });
}

export async function removeStudent(teacher: CurrentUser, classId: string, studentId: string) {
  await ownClass(teacher, classId);
  return withUser(db(), teacher.id, async (tx) => {
    await tx
      .delete(s.classMembers)
      .where(and(eq(s.classMembers.classId, classId), eq(s.classMembers.studentId, studentId)));
    await audit(
      tx,
      teacher.id,
      'class.student_removed',
      { type: 'class', id: classId },
      { studentId },
    );
  });
}

type StudentRow = {
  student_id: string;
  display_name: string;
  joined_at: Date;
  attempts: number;
  correct: number;
  attempts_7d: number;
  correct_7d: number;
  last_activity: Date | null;
};
type TopicRow = {
  topic_id: string;
  topic_name: string;
  discipline_name: string;
  students: number;
  attempts: number;
  correct: number;
};
type MissedRow = {
  question_id: string;
  stem: string;
  topic_name: string;
  attempts: number;
  wrong: number;
  common_wrong: string | null;
};

export type Attention = { reason: 'sem_atividade' | 'acerto_baixo'; text: string };

/** Quem precisa de atenção: parado há 7 dias, ou errando muito com amostra razoável. */
export function attentionFor(
  r: Pick<StudentRow, 'attempts_7d' | 'correct_7d' | 'attempts' | 'correct'>,
): Attention | null {
  if (r.attempts_7d === 0)
    return {
      reason: 'sem_atividade',
      text: r.attempts === 0 ? 'Ainda não começou' : 'Sem estudo há 7 dias',
    };
  if (r.attempts_7d >= 5 && r.correct_7d / r.attempts_7d < 0.5)
    return { reason: 'acerto_baixo', text: 'Acertando menos da metade na semana' };
  return null;
}

export async function getClassDashboard(teacher: CurrentUser, id: string) {
  const klass = await ownClass(teacher, id);
  return withUser(db(), teacher.id, async (tx) => {
    const students = (await tx.execute<StudentRow>(sql`select * from class_student_stats(${id})`))
      .rows;
    const topics = (await tx.execute<TopicRow>(sql`select * from class_topic_stats(${id})`)).rows;
    const missed = (
      await tx.execute<MissedRow>(sql`select * from class_missed_questions(${id}, 8)`)
    ).rows;
    const discipline = klass.disciplineId
      ? await tx.query.disciplines.findFirst({ where: eq(s.disciplines.id, klass.disciplineId) })
      : null;
    const total = students.reduce((a, r) => a + r.attempts_7d, 0);
    const correct = students.reduce((a, r) => a + r.correct_7d, 0);
    return {
      klass,
      discipline,
      students: students.map((r) => ({ ...r, attention: attentionFor(r) })),
      topics,
      missed,
      week: {
        activeStudents: students.filter((r) => r.attempts_7d > 0).length,
        attempts: total,
        accuracy: total ? correct / total : null,
      },
    };
  });
}

// ── Aluno ────────────────────────────────────────────────────────────────

export async function listStudentClasses(student: CurrentUser) {
  return withUser(db(), student.id, (tx) =>
    tx
      .select({
        id: s.classes.id,
        name: s.classes.name,
        joinedAt: s.classMembers.joinedAt,
        teacherName: s.profiles.displayName,
      })
      .from(s.classMembers)
      .innerJoin(s.classes, eq(s.classes.id, s.classMembers.classId))
      .leftJoin(s.profiles, eq(s.profiles.userId, s.classes.teacherId))
      .where(and(eq(s.classMembers.studentId, student.id), isNull(s.classMembers.leftAt)))
      .orderBy(asc(s.classes.name)),
  );
}

export async function joinClass(student: CurrentUser, raw: unknown) {
  const { code } = joinInput.parse(raw);
  try {
    return await withUser(db(), student.id, async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`select join_class(${code}) as id`);
      const classId = r.rows[0]!.id;
      await audit(tx, student.id, 'class.joined', { type: 'class', id: classId });
      return classId;
    });
  } catch (err) {
    if (pgCode(err) === 'P0002')
      throw new ApiError(
        404,
        'not_found',
        'Não achamos turma ativa com esse código. Confira com o professor.',
      );
    throw err;
  }
}

export async function leaveClass(student: CurrentUser, classId: string) {
  return withUser(db(), student.id, async (tx) => {
    await tx.execute(sql`select leave_class(${classId})`);
    await audit(tx, student.id, 'class.left', { type: 'class', id: classId });
  });
}
