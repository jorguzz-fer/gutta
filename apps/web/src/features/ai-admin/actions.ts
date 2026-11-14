'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { saveAiSettings } from './service';

export async function saveAiSettingsAction(form: FormData) {
  const user = await requireRole(['admin'], '/admin/ia');
  let q = 'ok=Configuração salva.';
  try {
    await saveAiSettings(user, Object.fromEntries(form));
  } catch (err) {
    if (err instanceof z.ZodError)
      q = `erro=${encodeURIComponent(err.issues[0]?.message ?? 'Confira os campos.')}`;
    else throw err;
  }
  revalidatePath('/admin/ia');
  redirect(`/admin/ia?${q}`);
}
