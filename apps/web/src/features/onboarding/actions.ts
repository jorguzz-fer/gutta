'use server';
import { zonedTimeToUtc } from '@gutta/core';
import { and, eq, inArray, isNull, schema as s, withUser } from '@gutta/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { track } from '@/lib/events';
import { logger } from '@/lib/logger';
import { recordConsents } from '@/features/privacy/consent';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z
  .object({
    mode: z.enum(['onboarding', 'perfil']),
    displayName: z.string().trim().min(2, 'Informe como quer ser chamado(a).').max(80).optional(),
    courseId: z.uuid('Escolha seu curso.'),
    institutionId: z.union([z.uuid(), z.literal(''), z.literal('outra')]).default(''),
    institutionOther: z.string().trim().max(160).optional().default(''),
    semester: z.coerce.number().int().min(1, 'Escolha o semestre.').max(16),
    disciplineIds: z.array(z.uuid()).min(1, 'Escolha pelo menos uma disciplina.').max(30),
    studyGoalMinutes: z.coerce.number().int().min(5).max(240),
    studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia.'),
    examDisciplineId: z.union([z.uuid(), z.literal('')]).default(''),
    examDate: z.union([day, z.literal('')]).default(''),
    examTitle: z.string().trim().max(80).optional().default(''),
    terms: z.literal('on').optional(),
  })
  .refine((v) => v.institutionId !== 'outra' || v.institutionOther.length >= 3, {
    path: ['institutionOther'],
    message: 'Digite o nome da instituição.',
  })
  .refine((v) => !v.examDate || v.examDisciplineId, {
    path: ['examDisciplineId'],
    message: 'Escolha a disciplina da prova.',
  });

export type ProfileFormState = {
  ok: boolean;
  errors: Record<string, string>;
  saved?: boolean;
} | null;

/**
 * Salva o perfil acadêmico. Idempotente: reenviar o mesmo formulário não duplica nada.
 * Trocar disciplina fecha o vínculo antigo (active_until) em vez de apagar o histórico.
 */
export async function saveAcademicProfile(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser('/onboarding');
  const parsed = schema.safeParse({
    ...Object.fromEntries(form),
    disciplineIds: form.getAll('disciplineIds'),
    studyDays: form.getAll('studyDays'),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? 'form')] ??= i.message;
    return { ok: false, errors };
  }
  const v = parsed.data;

  try {
    await withUser(db(), user.id, async (tx) => {
      const course = await tx.query.courses.findFirst({
        where: and(eq(s.courses.id, v.courseId), eq(s.courses.active, true)),
      });
      if (!course) throw new FormError('courseId', 'Curso indisponível.');

      // Só disciplinas do curso escolhido (evita conteúdo de outro curso por acidente).
      const valid = await tx
        .select({ id: s.disciplines.id })
        .from(s.disciplines)
        .where(
          and(eq(s.disciplines.courseId, v.courseId), inArray(s.disciplines.id, v.disciplineIds)),
        );
      if (valid.length !== new Set(v.disciplineIds).size) {
        throw new FormError('disciplineIds', 'Alguma disciplina não pertence ao curso escolhido.');
      }

      let institutionId: string | null =
        v.institutionId && v.institutionId !== 'outra' ? v.institutionId : null;
      let institutionOther: string | null = null;
      if (v.institutionId === 'outra') {
        institutionOther = v.institutionOther;
        const [suggested] = await tx
          .insert(s.institutions)
          .values({ name: v.institutionOther, status: 'pending', suggestedBy: user.id })
          .onConflictDoNothing()
          .returning({ id: s.institutions.id });
        institutionId = suggested?.id ?? null;
      }

      const now = new Date();
      const existing = await tx.query.studentProfiles.findFirst({
        where: eq(s.studentProfiles.userId, user.id),
      });
      const values = {
        courseId: v.courseId,
        institutionId,
        institutionOther,
        semester: v.semester,
        studyGoalMinutes: v.studyGoalMinutes,
        studyDays: [...new Set(v.studyDays)].sort(),
        onboardingCompletedAt: existing?.onboardingCompletedAt ?? now,
      };
      await tx
        .insert(s.studentProfiles)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: s.studentProfiles.userId, set: values });

      const active = await tx
        .select({ id: s.studentDisciplines.id, disciplineId: s.studentDisciplines.disciplineId })
        .from(s.studentDisciplines)
        .where(
          and(
            eq(s.studentDisciplines.studentId, user.id),
            isNull(s.studentDisciplines.activeUntil),
          ),
        );
      const wanted = new Set(v.disciplineIds);
      const toClose = active.filter((a) => !wanted.has(a.disciplineId)).map((a) => a.id);
      const toOpen = [...wanted].filter((id) => !active.some((a) => a.disciplineId === id));
      if (toClose.length) {
        await tx
          .update(s.studentDisciplines)
          .set({ activeUntil: now })
          .where(inArray(s.studentDisciplines.id, toClose));
      }
      if (toOpen.length) {
        await tx
          .insert(s.studentDisciplines)
          .values(toOpen.map((disciplineId) => ({ studentId: user.id, disciplineId })))
          .onConflictDoNothing();
      }

      if (v.displayName) {
        await tx
          .update(s.profiles)
          .set({ displayName: v.displayName })
          .where(eq(s.profiles.userId, user.id));
      }

      if (v.examDate && v.examDisciplineId) {
        const person = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) });
        const examAt = zonedTimeToUtc(v.examDate, person?.timezone ?? 'America/Sao_Paulo', 8);
        const dup = await tx.query.examDates.findFirst({
          where: and(
            eq(s.examDates.studentId, user.id),
            eq(s.examDates.disciplineId, v.examDisciplineId),
            eq(s.examDates.examAt, examAt),
          ),
        });
        if (!dup) {
          await tx.insert(s.examDates).values({
            studentId: user.id,
            disciplineId: v.examDisciplineId,
            title: v.examTitle || 'Prova',
            examAt,
          });
        }
      }

      if (v.terms === 'on') {
        await recordConsents(tx, user.id, { terms: true, privacy: true, learning_analytics: true });
      }
      if (!existing?.onboardingCompletedAt) {
        await track(tx, user.id, 'onboarding_completed', {
          semester: v.semester,
          disciplines: v.disciplineIds.length,
          hasExam: Boolean(v.examDate),
          institutionOther: v.institutionId === 'outra',
        });
      }
    });
  } catch (err) {
    if (err instanceof FormError) return { ok: false, errors: { [err.field]: err.message } };
    logger.error('onboarding.save_failed', { err: String(err) });
    return { ok: false, errors: { form: 'Não deu para salvar agora. Tente de novo.' } };
  }

  revalidatePath('/app', 'layout');
  if (v.mode === 'onboarding') redirect('/app?boas-vindas=1');
  return { ok: true, errors: {}, saved: true };
}

class FormError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

export async function removeExam(form: FormData) {
  const user = await requireUser('/app/perfil');
  const id = z.uuid().safeParse(form.get('examId'));
  if (!id.success) return;
  await withUser(db(), user.id, (tx) =>
    tx
      .delete(s.examDates)
      .where(and(eq(s.examDates.id, id.data), eq(s.examDates.studentId, user.id))),
  );
  revalidatePath('/app/perfil');
}
