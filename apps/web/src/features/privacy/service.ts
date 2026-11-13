import 'server-only';
import { and, desc, eq, ne, schema as s, sql, withUser, inSequence } from '@gutta/db';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, track } from '@/lib/events';
import { recordConsents, POLICY_VERSION, type ConsentPurpose } from './consent';

/** Prazo legal de resposta ao titular (LGPD art. 19, II). */
export const RESPONSE_DAYS = 15;

/** Estado atual de cada finalidade (o registro mais recente vence) e os pedidos da pessoa. */
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
    const requests = await tx
      .select()
      .from(s.dataRequests)
      .where(and(eq(s.dataRequests.userId, userId), ne(s.dataRequests.kind, 'export')))
      .orderBy(desc(s.dataRequests.createdAt))
      .limit(20);
    const openDeletion = requests.find((r) => r.kind === 'deletion' && r.status === 'open') ?? null;
    const [tutor] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.tutorMessages)
      .where(
        and(eq(s.tutorMessages.studentId, userId), sql`${s.tutorMessages.redactedAt} IS NULL`),
      );
    return {
      latest,
      openDeletion,
      requests: requests.filter((r) => r.kind !== 'deletion'),
      tutorMessages: tutor?.n ?? 0,
      policyVersion: POLICY_VERSION,
    };
  });
}

/** Finalidades que a pessoa liga e desliga sem perder o serviço essencial (art. 8º, §5º). */
export const OPTIONAL_PURPOSES = ['marketing', 'ai_tutor'] as const;
export type OptionalPurpose = (typeof OPTIONAL_PURPOSES)[number];

export async function setConsent(userId: string, purpose: OptionalPurpose, granted: boolean) {
  await withUser(db(), userId, async (tx) => {
    await recordConsents(tx, userId, { [purpose]: granted });
    await audit(tx, userId, 'consent.changed', { type: 'user', id: userId }, { purpose, granted });
  });
}

export async function setMarketing(userId: string, granted: boolean) {
  return setConsent(userId, 'marketing', granted);
}

/** Nova versão dos termos e da política: aceite registrado com a versão atual. */
export async function acceptPolicy(userId: string) {
  await withUser(db(), userId, async (tx) => {
    await recordConsents(tx, userId, { terms: true, privacy: true });
    await audit(
      tx,
      userId,
      'consent.policy_accepted',
      { type: 'user', id: userId },
      { version: POLICY_VERSION },
    );
  });
}

export const RIGHT_KINDS = ['correction', 'information', 'objection', 'other'] as const;
export const RIGHT_LABEL: Record<(typeof RIGHT_KINDS)[number] | 'deletion' | 'export', string> = {
  correction: 'Corrigir dados',
  information: 'Saber com quem compartilhamos',
  objection: 'Me opor a um uso ou pedir revisão',
  other: 'Outro pedido',
  deletion: 'Excluir conta',
  export: 'Baixar dados',
};

export const rightInput = z.object({
  kind: z.enum(RIGHT_KINDS, 'Escolha o tipo de pedido.'),
  details: z
    .string()
    .trim()
    .min(10, 'Conte em poucas palavras o que você precisa.')
    .max(2000, 'Use no máximo 2.000 caracteres.'),
});

/** Pedido do titular (art. 18) com prazo de resposta. Um aberto por tipo, para não duplicar. */
export async function requestRight(userId: string, raw: unknown) {
  const v = rightInput.parse(raw);
  return withUser(db(), userId, async (tx) => {
    const open = await tx.query.dataRequests.findFirst({
      where: and(
        eq(s.dataRequests.userId, userId),
        eq(s.dataRequests.kind, v.kind),
        eq(s.dataRequests.status, 'open'),
      ),
    });
    if (open)
      throw new ApiError(
        409,
        'conflict',
        'Você já tem um pedido desse tipo em aberto. Responderemos nele.',
      );
    const [row] = await tx
      .insert(s.dataRequests)
      .values({ userId, kind: v.kind, details: v.details })
      .returning();
    await audit(tx, userId, 'data.request_opened', { type: 'user', id: userId }, { kind: v.kind });
    return row!;
  });
}

export async function cancelRequest(userId: string, id: string) {
  await withUser(db(), userId, async (tx) => {
    await tx
      .update(s.dataRequests)
      .set({ status: 'cancelled', resolvedAt: new Date() })
      .where(
        and(
          eq(s.dataRequests.id, id),
          eq(s.dataRequests.userId, userId),
          eq(s.dataRequests.status, 'open'),
        ),
      );
  });
}

/** Apaga o texto das conversas com o tutor. Tokens e custo ficam (sem conteúdo). */
export async function redactTutorHistory(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const res = await tx.execute<{ n: number }>(sql`SELECT redact_my_tutor_history() AS n`);
    const n = Number(res.rows[0]?.n ?? 0);
    await audit(tx, userId, 'tutor.history_redacted', { type: 'user', id: userId }, { count: n });
    return n;
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
      tutorMessages,
      classes,
      terms,
      enrolled,
      teachers,
      topicsOwn,
      files,
      filePages,
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
      () =>
        tx
          .select({
            role: s.tutorMessages.role,
            content: s.tutorMessages.content,
            redactedAt: s.tutorMessages.redactedAt,
            moduleId: s.tutorConversations.moduleId,
            createdAt: s.tutorMessages.createdAt,
          })
          .from(s.tutorMessages)
          .innerJoin(
            s.tutorConversations,
            eq(s.tutorConversations.id, s.tutorMessages.conversationId),
          )
          .where(eq(s.tutorMessages.studentId, userId)),
      () => tx.select().from(s.classMembers).where(eq(s.classMembers.studentId, userId)),
      // v2 (SPEC v2, 10.1): vida acadêmica e arquivos. O conteúdo dos arquivos fica no bucket;
      // aqui vão os metadados e o texto extraído de cada página.
      () => tx.select().from(s.studentTerms).where(eq(s.studentTerms.ownerId, userId)),
      () =>
        tx.select().from(s.enrolledDisciplines).where(eq(s.enrolledDisciplines.ownerId, userId)),
      () => tx.select().from(s.disciplineTeachers).where(eq(s.disciplineTeachers.ownerId, userId)),
      () => tx.select().from(s.disciplineTopics).where(eq(s.disciplineTopics.ownerId, userId)),
      () => tx.select().from(s.files).where(eq(s.files.ownerId, userId)),
      () => tx.select().from(s.filePages).where(eq(s.filePages.ownerId, userId)),
    ]);
    await tx
      .insert(s.dataRequests)
      .values({ userId, kind: 'export', status: 'done', resolvedAt: new Date() });
    await track(tx, userId, 'data_export_requested');
    return {
      exportedAt: new Date().toISOString(),
      notice: 'Seus dados no Cognuss. Senhas não são exportadas: guardamos só uma versão cifrada.',
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
      tutorMessages,
      classMemberships: classes,
      terms,
      enrolledDisciplines: enrolled,
      disciplineTeachers: teachers,
      disciplineTopics: topicsOwn,
      files,
      filePages,
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
