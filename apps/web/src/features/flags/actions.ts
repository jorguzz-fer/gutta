'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { saveFlags } from './service';

export async function saveFlagsAction(form: FormData) {
  const user = await requireRole(['admin'], '/admin/funcionalidades');
  await saveFlags(user, Object.fromEntries(form));
  revalidatePath('/', 'layout');
  redirect(`/admin/funcionalidades?ok=${encodeURIComponent('Chaves salvas.')}`);
}
