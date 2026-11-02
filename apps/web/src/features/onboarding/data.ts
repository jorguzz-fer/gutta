import 'server-only';
import { and, asc, eq, isNull, schema as s, withUser, inSequence } from '@gutta/db';
import { db } from '@/lib/db';

export type OnboardingData = Awaited<ReturnType<typeof loadOnboardingData>>;

// Tudo que o formulário precisa numa ida ao banco, já filtrado pelo RLS do aluno.
export async function loadOnboardingData(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const [courses, institutions, disciplines, profile, activeLinks, consents, exams, person] =
      await inSequence([
        () =>
          tx
            .select({ id: s.courses.id, name: s.courses.name, isDemo: s.courses.isDemo })
            .from(s.courses)
            .where(eq(s.courses.active, true))
            .orderBy(asc(s.courses.name)),
        () =>
          tx
            .select({
              id: s.institutions.id,
              name: s.institutions.name,
              status: s.institutions.status,
            })
            .from(s.institutions)
            .orderBy(asc(s.institutions.name)),
        () =>
          tx
            .select({
              id: s.disciplines.id,
              courseId: s.disciplines.courseId,
              name: s.disciplines.name,
              description: s.disciplines.description,
              periodHint: s.disciplines.periodHint,
            })
            .from(s.disciplines)
            .where(eq(s.disciplines.active, true))
            .orderBy(asc(s.disciplines.periodHint), asc(s.disciplines.name)),
        () => tx.query.studentProfiles.findFirst({ where: eq(s.studentProfiles.userId, userId) }),
        () =>
          tx
            .select({ disciplineId: s.studentDisciplines.disciplineId })
            .from(s.studentDisciplines)
            .where(
              and(
                eq(s.studentDisciplines.studentId, userId),
                isNull(s.studentDisciplines.activeUntil),
              ),
            ),
        () =>
          tx
            .select({ purpose: s.consentRecords.purpose })
            .from(s.consentRecords)
            .where(and(eq(s.consentRecords.userId, userId), eq(s.consentRecords.purpose, 'terms'))),
        () =>
          tx
            .select()
            .from(s.examDates)
            .where(eq(s.examDates.studentId, userId))
            .orderBy(asc(s.examDates.examAt)),
        () => tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) }),
      ]);
    return {
      courses,
      institutions,
      disciplines,
      profile: profile ?? null,
      activeDisciplineIds: activeLinks.map((l) => l.disciplineId),
      needsConsent: consents.length === 0,
      exams,
      timezone: person?.timezone ?? 'America/Sao_Paulo',
      displayName: person?.displayName ?? '',
    };
  });
}

export async function isOnboarded(userId: string) {
  const row = await withUser(db(), userId, (tx) =>
    tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
      columns: { onboardingCompletedAt: true },
    }),
  );
  return Boolean(row?.onboardingCompletedAt);
}
