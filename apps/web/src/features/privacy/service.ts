import 'server-only';
import { and, desc, eq, schema as s, withUser, inSequence } from '@gutta/db';
import { db } from '@/lib/db';
import { audit, track } from '@/lib/events';
import { recordConsents, POLICY_VERSION, type ConsentPurpose } from './consent';

/** Estado atual de cada finalidade: o registro mais recente vence. */
export async function currentConsents(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const rows = await tx
      .select()
      .from(s.consentRecords)
      .where(eq(s.consentRecords.userId, userId))
      .orderBy(desc(s.consentRecords.recordedAt));
    const latest: Partial<Record<ConsentPurpose, { granted: boolean; at: Date; version: string }>> =
      {};
    for (const r of rows)
      latest[r.purpose] ??= { granted: r.granted, at: r.recordedAt, version: r.policyVersion };
    const openDeletion = await tx.query.dataRequests.findFirst({
      where: and(
        eq(s.dataRequests.userId, userId),
        eq(s.dataRequests.kind, 'deletion'),
        eq(s.dataRequests.status, 'open'),
      ),
    });
    return { latest, openDeletion: openDeletion ?? null, policyVersion: POLICY_VERSION };
  });
}

export async function setMarketing(userId: string, granted: boolean) {
  await withUser(db(), userId, async (tx) => {
    await recordConsents(tx, userId, { marketing: granted });
    await audit(
      tx,
      userId,
      'consent.changed',
      { type: 'user', id: userId },
      { purpose: 'marketing', granted },
    );
  });
}

/** Exportação (LGPD, acesso e portabilidade): tudo que é do aluno, em JSON legível. */
export async function exportData(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const account = await tx.query.authUsers.findFirst({
      where: eq(s.authUsers.id, userId),
      columns: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
    });
    const [
      profile,
      studentProfile,
      disciplines,
      exams,
      sessions,
      attempts,
      mastery,
      flashcards,
      schedules,
      reviews,
      consents,
      recommendations,
      events,
      requests,
    ] = await inSequence([
      () => tx.select().from(s.profiles).where(eq(s.profiles.userId, userId)),
      () => tx.select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, userId)),
      () =>
        tx.select().from(s.studentDisciplines).where(eq(s.studentDisciplines.studentId, userId)),
      () => tx.select().from(s.examDates).where(eq(s.examDates.studentId, userId)),
      () => tx.select().from(s.questionSessions).where(eq(s.questionSessions.studentId, userId)),
      () => tx.select().from(s.questionAttempts).where(eq(s.questionAttempts.studentId, userId)),
      () => tx.select().from(s.topicMastery).where(eq(s.topicMastery.studentId, userId)),
      () => tx.select().from(s.flashcards).where(eq(s.flashcards.ownerId, userId)),
      () =>
        tx.select().from(s.flashcardSchedules).where(eq(s.flashcardSchedules.studentId, userId)),
      () => tx.select().from(s.flashcardReviews).where(eq(s.flashcardReviews.studentId, userId)),
      () => tx.select().from(s.consentRecords).where(eq(s.consentRecords.userId, userId)),
      () =>
        tx
          .select()
          .from(s.learningRecommendations)
          .where(eq(s.learningRecommendations.studentId, userId)),
      () => tx.select().from(s.productEvents).where(eq(s.productEvents.actorId, userId)),
      () => tx.select().from(s.dataRequests).where(eq(s.dataRequests.userId, userId)),
    ]);
    await tx
      .insert(s.dataRequests)
      .values({ userId, kind: 'export', status: 'done', resolvedAt: new Date() });
    await track(tx, userId, 'data_export_requested');
    return {
      exportedAt: new Date().toISOString(),
      notice:
        'Seus dados no Gutta Project. Senhas não são exportadas: guardamos só uma versão cifrada.',
      account,
      profile: profile[0] ?? null,
      studentProfile: studentProfile[0] ?? null,
      disciplines,
      exams,
      questionSessions: sessions,
      questionAttempts: attempts,
      topicMastery: mastery,
      personalFlashcards: flashcards,
      flashcardSchedules: schedules,
      flashcardReviews: reviews,
      consents,
      recommendations,
      productEvents: events,
      dataRequests: requests,
    };
  });
}

export async function requestDeletion(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const open = await tx.query.dataRequests.findFirst({
      where: and(
        eq(s.dataRequests.userId, userId),
        eq(s.dataRequests.kind, 'deletion'),
        eq(s.dataRequests.status, 'open'),
      ),
    });
    if (open) return open;
    const [row] = await tx.insert(s.dataRequests).values({ userId, kind: 'deletion' }).returning();
    await audit(tx, userId, 'data.deletion_requested', { type: 'user', id: userId });
    await track(tx, userId, 'account_deletion_requested');
    return row!;
  });
}

export async function cancelDeletion(userId: string) {
  await withUser(db(), userId, async (tx) => {
    await tx
      .update(s.dataRequests)
      .set({ status: 'cancelled', resolvedAt: new Date() })
      .where(
        and(
          eq(s.dataRequests.userId, userId),
          eq(s.dataRequests.kind, 'deletion'),
          eq(s.dataRequests.status, 'open'),
        ),
      );
    await audit(tx, userId, 'data.deletion_cancelled', { type: 'user', id: userId });
  });
}
