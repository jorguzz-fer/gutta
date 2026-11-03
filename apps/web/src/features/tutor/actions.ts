'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireRole, requireStudent } from '@/lib/auth/session';
import { setConsent } from '@/features/privacy/service';
import { askTutor, saveTutorSettings } from './service';

export type TutorState = { error?: string; at?: number } | null;

export async function askTutorAction(_prev: TutorState, form: FormData): Promise<TutorState> {
  const user = await requireStudent('/app');
  const path = String(form.get('path') ?? '/app');
  try {
    await askTutor(user, { moduleId: form.get('moduleId'), message: form.get('message') });
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message, at: Date.now() };
    if (err instanceof ApiError) return { error: err.message, at: Date.now() };
    throw err;
  }
  if (path.startsWith('/app/')) revalidatePath(path);
  return { at: Date.now() };
}

export async function saveTutorSettingsAction(form: FormData) {
  const user = await requireRole(['admin'], '/admin/tutor');
  let q = 'ok=Configuração salva.';
  try {
    await saveTutorSettings(user, Object.fromEntries(form));
  } catch (err) {
    if (err instanceof z.ZodError)
      q = `erro=${encodeURIComponent(err.issues[0]?.message ?? 'Confira os campos.')}`;
    else throw err;
  }
  revalidatePath('/admin/tutor');
  redirect(`/admin/tutor?${q}`);
}

/** Consentimento específico do tutor (transferência internacional, LGPD art. 33, VIII). */
export async function tutorConsentAction(form: FormData) {
  const user = await requireStudent('/app');
  await setConsent(user.id, 'ai_tutor', true);
  const path = String(form.get('path') ?? '/app');
  revalidatePath(path.startsWith('/app/') ? path : '/app');
}
