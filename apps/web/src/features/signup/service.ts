import 'server-only';
import { digits, isValidCpf, maskCpf, normalizePhone } from '@gutta/core';
import { and, asc, eq, schema as s, withUser, type Tx } from '@gutta/db';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit, track } from '@/lib/events';
import { encryptPii, hashPii } from '@/lib/pii';
import { latestConsent, recordConsents } from '@/features/privacy/consent';
import { disciplineCount } from '@/features/academics/service';
import { confirmRoutine, routineConfirmed } from '@/features/routine/service';
import { MAIN_GOALS, nextStep, type SignupProgress } from './steps';

// Cadastro da v2 (SPEC v2, CAD-01 a CAD-10). Cada passo grava na hora: sair no meio e voltar
// continua de onde parou, e repetir um passo atualiza em vez de duplicar.

export class SignupError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

async function progressOf(tx: Tx, userId: string): Promise<SignupProgress> {
  const personal = await tx.query.personalData.findFirst({
    where: eq(s.personalData.userId, userId),
    columns: { userId: true },
  });
  const profile = await tx.query.studentProfiles.findFirst({
    where: eq(s.studentProfiles.userId, userId),
    columns: { mainGoal: true },
  });
  const disciplinas = (await disciplineCount(tx, userId)) > 0;
  const rotina = await routineConfirmed(tx, userId);
  return { dados: Boolean(personal), perfil: Boolean(profile?.mainGoal), disciplinas, rotina };
}

export async function loadSignup(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const progress = await progressOf(tx, userId);
    const personal = await tx.query.personalData.findFirst({
      where: eq(s.personalData.userId, userId),
    });
    const account = await tx.query.authUsers.findFirst({
      where: eq(s.authUsers.id, userId),
      columns: { name: true },
    });
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
    });
    const courses = await tx
      .select({ id: s.courses.id, name: s.courses.name, slug: s.courses.slug })
      .from(s.courses)
      .where(eq(s.courses.active, true))
      .orderBy(asc(s.courses.name));
    const institutions = await tx
      .select({ id: s.institutions.id, name: s.institutions.name })
      .from(s.institutions)
      .where(eq(s.institutions.status, 'active'))
      .orderBy(asc(s.institutions.name));
    const terms = await latestConsent(tx, userId, 'terms');
    return {
      progress,
      next: nextStep(progress),
      needsTerms: !terms?.granted,
      personal: {
        fullName: personal?.fullName ?? account?.name ?? '',
        // Nunca o CPF inteiro de volta para a tela: só os dois últimos dígitos.
        cpfMasked: personal ? maskCpf(personal.cpfLast2) : null,
        phone: personal?.phone ?? '',
      },
      profile,
      // "Outro curso da saúde" vai por último na lista.
      courses: [...courses].sort((a, b) =>
        a.slug === 'outro-curso-da-saude' ? 1 : b.slug === 'outro-curso-da-saude' ? -1 : 0,
      ),
      institutions,
    };
  });
}

const personalInput = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, 'Digite seu nome completo.')
    .max(160)
    .refine((v) => v.includes(' '), 'Digite nome e sobrenome.'),
  // Vazio quando o aluno já tem CPF salvo e não quer trocar.
  cpf: z.string().trim().max(20).optional().default(''),
  phone: z.string().trim().min(8, 'Informe seu telefone com DDD.').max(30),
  terms: z.literal('on').optional(),
});

export async function savePersonal(userId: string, raw: unknown) {
  const v = personalInput.parse(raw);
  const phone = normalizePhone(v.phone);
  if (!phone)
    throw new SignupError('phone', 'Telefone inválido. Use DDD e número, como (11) 98765-4321.');
  return withUser(db(), userId, async (tx) => {
    const existing = await tx.query.personalData.findFirst({
      where: eq(s.personalData.userId, userId),
    });
    if (!(await latestConsent(tx, userId, 'terms'))?.granted && v.terms !== 'on') {
      throw new SignupError(
        'terms',
        'Para continuar, aceite os termos de uso e a política de privacidade.',
      );
    }
    const cpf = digits(v.cpf);
    if (!existing && !cpf) throw new SignupError('cpf', 'Informe seu CPF.');
    if (cpf && !isValidCpf(cpf)) throw new SignupError('cpf', 'CPF inválido. Confira os números.');
    const cpfFields = cpf
      ? { cpfEncrypted: encryptPii(cpf), cpfHash: hashPii(cpf), cpfLast2: cpf.slice(-2) }
      : {};
    try {
      if (existing) {
        await tx
          .update(s.personalData)
          .set({ fullName: v.fullName, phone, ...cpfFields })
          .where(eq(s.personalData.userId, userId));
      } else {
        await tx.insert(s.personalData).values({
          userId,
          fullName: v.fullName,
          phone,
          ...(cpfFields as Required<typeof cpfFields>),
        });
      }
    } catch (err) {
      const code = (err as { cause?: { code?: string; constraint?: string } }).cause;
      if (code?.code === '23505' && code.constraint === 'personal_data_cpf_hash_uq') {
        throw new SignupError(
          'cpf',
          'Este CPF já está em outra conta. Se for sua, entre por ela ou fale com o suporte.',
        );
      }
      throw err;
    }
    if (v.terms === 'on') {
      await recordConsents(tx, userId, { terms: true, privacy: true, learning_analytics: true });
    }
    await tx
      .update(s.profiles)
      .set({ displayName: v.fullName.split(' ')[0]! })
      .where(eq(s.profiles.userId, userId));
    // Auditoria sem o CPF: só que o dado foi gravado ou trocado.
    await audit(
      tx,
      userId,
      existing ? 'personal_data.updated' : 'personal_data.created',
      {
        type: 'personal_data',
        id: userId,
      },
      { cpfChanged: Boolean(cpf) },
    );
    if (!existing) await track(tx, userId, 'signup_step_completed', { step: 'dados' });
  });
}

const profileInput = z
  .object({
    courseId: z.uuid('Escolha seu curso.'),
    courseOther: z.string().trim().max(120).optional().default(''),
    semester: z.coerce.number().int().min(1, 'Escolha o semestre.').max(16),
    institutionId: z.union([z.uuid(), z.literal(''), z.literal('outra')]).default(''),
    institutionOther: z.string().trim().max(160).optional().default(''),
    campus: z.string().trim().max(120).optional().default(''),
    classGroup: z.string().trim().max(40).optional().default(''),
    mainGoal: z.enum(MAIN_GOALS.map((g) => g.value) as [string, ...string[]], {
      error: 'Escolha seu objetivo principal.',
    }),
  })
  .refine((v) => v.institutionId !== '', {
    path: ['institutionId'],
    message: 'Escolha sua instituição.',
  })
  .refine((v) => v.institutionId !== 'outra' || v.institutionOther.length >= 3, {
    path: ['institutionOther'],
    message: 'Digite o nome da instituição.',
  });

export async function saveProfile(userId: string, raw: unknown) {
  const v = profileInput.parse(raw);
  return withUser(db(), userId, async (tx) => {
    const progress = await progressOf(tx, userId);
    if (!progress.dados) throw new SignupError('form', 'Preencha seus dados pessoais antes.');
    const course = await tx.query.courses.findFirst({
      where: and(eq(s.courses.id, v.courseId), eq(s.courses.active, true)),
    });
    if (!course) throw new SignupError('courseId', 'Curso indisponível.');
    const isOther = course.slug === 'outro-curso-da-saude';
    if (isOther && v.courseOther.length < 3) {
      throw new SignupError('courseOther', 'Digite o nome do seu curso.');
    }
    let institutionId: string | null = v.institutionId === 'outra' ? null : v.institutionId;
    let institutionOther: string | null = null;
    if (v.institutionId === 'outra') {
      institutionOther = v.institutionOther;
      const [suggested] = await tx
        .insert(s.institutions)
        .values({ name: v.institutionOther, status: 'pending', suggestedBy: userId })
        .onConflictDoNothing()
        .returning({ id: s.institutions.id });
      institutionId = suggested?.id ?? null;
    }
    const values = {
      courseId: v.courseId,
      courseOther: isOther ? v.courseOther : null,
      semester: v.semester,
      institutionId,
      institutionOther,
      campus: v.campus || null,
      classGroup: v.classGroup || null,
      mainGoal: v.mainGoal as (typeof s.mainGoal.enumValues)[number],
    };
    await tx
      .insert(s.studentProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: s.studentProfiles.userId, set: values });
    if (!progress.perfil) {
      await track(tx, userId, 'signup_step_completed', { step: 'perfil', course: course.slug });
    }
  });
}

/** Passo da rotina (CAD-05): a meta não precisa estar cumprida para seguir. */
export async function saveRoutineStep(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const progress = await progressOf(tx, userId);
    if (!progress.disciplinas) throw new SignupError('form', 'Adicione suas disciplinas antes.');
    await confirmRoutine(tx, userId);
  });
}

/** Fim do cadastro: libera o app. Rodar de novo não muda a data da primeira conclusão. */
export async function finishSignup(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const progress = await progressOf(tx, userId);
    if (nextStep(progress)) return false;
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(s.studentProfiles.userId, userId),
    });
    if (!profile?.onboardingCompletedAt) {
      await tx
        .update(s.studentProfiles)
        .set({ onboardingCompletedAt: new Date(), signupStep: 'concluido' })
        .where(eq(s.studentProfiles.userId, userId));
      await track(tx, userId, 'onboarding_completed', { flow: 'v2' });
    }
    return true;
  });
}
