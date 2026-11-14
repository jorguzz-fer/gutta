'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/session';
import { setConsent } from '@/features/privacy/service';

/** Autoriza a leitura dos materiais com o texto que cita a Voyage AI (busca por assunto). */
export async function grantConceptSearchAction(form: FormData) {
  const user = await requireStudent('/app/busca');
  await setConsent(user.id, 'ai_materials', true);
  const q = String(form.get('q') ?? '').slice(0, 200);
  revalidatePath('/app/busca');
  redirect(`/app/busca${q ? `?q=${encodeURIComponent(q)}&autorizado=1` : '?autorizado=1'}`);
}
