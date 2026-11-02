'use server';
import { eq, schema, withUser } from '@gutta/db';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { auth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordConsents } from '@/features/privacy/consent';
import { track } from '@/lib/events';

const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Informe como quer ser chamado(a).').max(80),
  // Postel: aceita espaços e maiúsculas, normaliza aqui.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Confira o e-mail: falta algo como nome@exemplo.com.')),
  password: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres.')
    .max(128, 'A senha pode ter no máximo 128 caracteres.'),
  terms: z.literal('on', { error: 'Para criar a conta, aceite os termos e a política.' }),
  marketing: z.literal('on').optional(),
});

export type SignUpState =
  | {
      ok: false;
      errors: Partial<Record<'name' | 'email' | 'password' | 'terms' | 'form', string>>;
      values?: { name?: string; email?: string };
    }
  | { ok: true; email: string };

export async function signUpAction(
  _prev: SignUpState | null,
  form: FormData,
): Promise<SignUpState> {
  const raw = Object.fromEntries(form) as Record<string, string>;
  const parsed = signUpSchema.safeParse(raw);
  const values = { name: raw.name, email: raw.email };
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return { ok: false, errors, values };
  }
  const { name, email, password, marketing } = parsed.data;
  try {
    const res = await auth().api.signUpEmail({
      body: { name, email, password, callbackURL: '/onboarding' },
    });
    const userId = res.user.id;
    // Com verificação obrigatória, e-mail já cadastrado devolve um usuário fictício (anti-enumeração).
    // Só gravamos consentimento se a conta nova existe de fato.
    const created = await db().query.authUsers.findFirst({
      where: eq(schema.authUsers.id, userId),
      columns: { id: true },
    });
    if (!created) return { ok: true, email };
    await withUser(db(), userId, async (tx) => {
      await recordConsents(tx, userId, {
        terms: true,
        privacy: true,
        learning_analytics: true,
        marketing: marketing === 'on',
      });
      await track(tx, userId, 'account_created', { marketing: marketing === 'on' });
    });
    return { ok: true, email };
  } catch (err) {
    if (err instanceof APIError) {
      // Conta já existente: mesma resposta de sucesso, para não revelar quem tem conta.
      if (
        err.body?.code === 'USER_ALREADY_EXISTS' ||
        err.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
      ) {
        return { ok: true, email };
      }
      if (err.status === 'TOO_MANY_REQUESTS') {
        return {
          ok: false,
          errors: { form: 'Muitas tentativas. Espere um minuto e tente de novo.' },
          values,
        };
      }
      if (err.body?.code === 'PASSWORD_TOO_SHORT' || err.body?.code === 'PASSWORD_TOO_LONG') {
        return {
          ok: false,
          errors: { password: 'A senha precisa ter entre 8 e 128 caracteres.' },
          values,
        };
      }
    }
    logger.error('auth.sign_up_failed', { err: String(err) });
    return {
      ok: false,
      errors: { form: 'Não foi possível criar a conta agora. Tente de novo em instantes.' },
      values,
    };
  }
}
