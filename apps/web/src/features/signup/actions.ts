'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import {
  finishSignup,
  loadSignup,
  savePersonal,
  saveProfile,
  saveRoutineStep,
  SignupError,
} from './service';

// Os valores enviados voltam junto com o erro: o React limpa o formulário depois da ação, e o
// aluno não pode perder o que digitou.
export type SignupFormState = {
  errors: Record<string, string>;
  values?: Record<string, string>;
} | null;

function toErrors(err: unknown, form: FormData): SignupFormState {
  const values = Object.fromEntries(
    [...form.entries()].filter(([k, v]) => typeof v === 'string' && !k.startsWith('$')),
  ) as Record<string, string>;
  if (err instanceof SignupError) return { errors: { [err.field]: err.message }, values };
  if (err instanceof z.ZodError) {
    const errors: Record<string, string> = {};
    for (const i of err.issues) errors[String(i.path[0] ?? 'form')] ??= i.message;
    return { errors, values };
  }
  logger.error('signup.save_failed', { err: String(err) });
  return { errors: { form: 'Não deu para salvar agora. Tente de novo.' }, values };
}

/** Depois de salvar um passo, vai para o próximo ou, no fim, para o app. */
async function goNext(userId: string): Promise<never> {
  const { next } = await loadSignup(userId);
  if (next) redirect(next.path);
  await finishSignup(userId);
  redirect('/app?boas-vindas=1');
}

export async function savePersonalAction(
  _prev: SignupFormState,
  form: FormData,
): Promise<SignupFormState> {
  const user = await requireUser('/comecar/dados');
  try {
    await savePersonal(user.id, Object.fromEntries(form));
  } catch (err) {
    return toErrors(err, form);
  }
  return goNext(user.id);
}

export async function saveProfileAction(
  _prev: SignupFormState,
  form: FormData,
): Promise<SignupFormState> {
  const user = await requireUser('/comecar/perfil');
  try {
    await saveProfile(user.id, Object.fromEntries(form));
  } catch (err) {
    return toErrors(err, form);
  }
  return goNext(user.id);
}

/** Passo das disciplinas: elas já foram salvas pela API; aqui só confere e segue. */
export async function continueFromDisciplinesAction(
  _prev: SignupFormState,
  _form: FormData,
): Promise<SignupFormState> {
  const user = await requireUser('/comecar/disciplinas');
  const { progress } = await loadSignup(user.id);
  if (!progress.disciplinas) {
    return { errors: { form: 'Adicione pelo menos uma disciplina para continuar.' } };
  }
  return goNext(user.id);
}

/** Passo da rotina: os blocos já foram salvos pela API; aqui marca o passo e segue. */
export async function continueFromRoutineAction(
  _prev: SignupFormState,
  form: FormData,
): Promise<SignupFormState> {
  const user = await requireUser('/comecar/rotina');
  try {
    await saveRoutineStep(user.id);
  } catch (err) {
    return toErrors(err, form);
  }
  return goNext(user.id);
}
