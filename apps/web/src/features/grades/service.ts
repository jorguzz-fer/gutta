import 'server-only';
import {
  cumulativeAverages,
  gradeSummary,
  localDayKey,
  neededGrade,
  type GradeItem,
} from '@gutta/core';
import type { grades as contract } from '@gutta/contracts';
import { and, asc, eq, schema as s, sql, withUser, type Tx } from '@gutta/db';
import { ApiError, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';

// Notas (SPEC v2, NOT-01, 02, 04, 05, 08 a 11, 14, 19). A avaliação é a mesma do calendário;
// aqui entram nota, peso e porcentagem. Nota pendente não é zero.

type Dto = contract.GradesDto;
const num = (v: string | null) => (v === null ? null : Number(v));

export async function assertGradesEnabled() {
  const on = await flags();
  if (!on.notas) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

async function load(tx: Tx, userId: string, disciplineId: string): Promise<Dto> {
  const disc = await tx.query.enrolledDisciplines.findFirst({
    where: and(
      eq(s.enrolledDisciplines.id, disciplineId),
      eq(s.enrolledDisciplines.ownerId, userId),
    ),
  });
  if (!disc) throw notFound('Disciplina');
  const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const tz = profile?.timezone ?? 'America/Sao_Paulo';
  const scheme = await tx.query.gradingSchemes.findFirst({
    where: eq(s.gradingSchemes.disciplineId, disciplineId),
  });
  const method = scheme?.method ?? 'pesos';
  const minGrade = scheme ? Number(scheme.minGrade) : 7;
  const rows = await tx
    .select()
    .from(s.assessments)
    .where(eq(s.assessments.disciplineId, disciplineId))
    .orderBy(sql`${s.assessments.dueAt} asc nulls last`, asc(s.assessments.createdAt));
  const items: GradeItem[] = rows.map((a) => ({
    id: a.id,
    grade: num(a.grade),
    maxGrade: Number(a.maxGrade),
    weight: num(a.weight),
    percent: num(a.percent),
  }));
  const summary = gradeSummary(method, items);
  const needed = neededGrade({
    currentAverage: summary.current ?? 0,
    doneShare: summary.doneShare,
    remainingShare: summary.remainingShare,
    desired: minGrade,
  });
  return {
    disciplineId,
    disciplineName: disc.name,
    scheme: { method, minGrade, configured: Boolean(scheme) },
    assessments: rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      date: a.dueAt ? localDayKey(a.dueAt, tz) : null,
      grade: num(a.grade),
      maxGrade: Number(a.maxGrade),
      weight: num(a.weight),
      percent: num(a.percent),
    })),
    summary,
    needed,
    cumulative: cumulativeAverages(method, items),
  };
}

export async function getGrades(userId: string, disciplineId: string) {
  await assertGradesEnabled();
  return withUser(db(), userId, async (tx) => ({ grades: await load(tx, userId, disciplineId) }));
}

export async function saveScheme(
  userId: string,
  disciplineId: string,
  body: { method: 'simples' | 'pesos' | 'percentual'; minGrade: number },
) {
  await assertGradesEnabled();
  return withUser(db(), userId, async (tx) => {
    await load(tx, userId, disciplineId);
    const values = { method: body.method, minGrade: String(body.minGrade) };
    await tx
      .insert(s.gradingSchemes)
      .values({ ownerId: userId, disciplineId, ...values })
      .onConflictDoUpdate({ target: s.gradingSchemes.disciplineId, set: values });
    return { grades: await load(tx, userId, disciplineId) };
  });
}

export async function saveGrade(
  userId: string,
  assessmentId: string,
  body: { grade: number | null; maxGrade: number; weight: number | null; percent: number | null },
) {
  await assertGradesEnabled();
  return withUser(db(), userId, async (tx) => {
    const [row] = await tx
      .update(s.assessments)
      .set({
        grade: body.grade === null ? null : String(body.grade),
        maxGrade: String(body.maxGrade),
        weight: body.weight === null ? null : String(body.weight),
        percent: body.percent === null ? null : String(body.percent),
      })
      .where(and(eq(s.assessments.id, assessmentId), eq(s.assessments.ownerId, userId)))
      .returning({ disciplineId: s.assessments.disciplineId });
    if (!row) throw notFound('Avaliação');
    return { grades: await load(tx, userId, row.disciplineId) };
  });
}

/** Resumo por disciplina do semestre atual, para a lista de notas. */
export async function gradesOverview(userId: string) {
  await assertGradesEnabled();
  return withUser(db(), userId, async (tx) => {
    const discs = await tx
      .select({ id: s.enrolledDisciplines.id })
      .from(s.enrolledDisciplines)
      .innerJoin(s.studentTerms, eq(s.studentTerms.id, s.enrolledDisciplines.termId))
      .where(
        and(
          eq(s.enrolledDisciplines.ownerId, userId),
          eq(s.studentTerms.isCurrent, true),
          sql`${s.enrolledDisciplines.archivedAt} is null`,
        ),
      )
      .orderBy(asc(s.enrolledDisciplines.createdAt));
    const out: Dto[] = [];
    for (const d of discs) out.push(await load(tx, userId, d.id));
    return out;
  });
}
