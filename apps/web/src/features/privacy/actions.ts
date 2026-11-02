'use server';
import { revalidatePath } from 'next/cache';
import { requireStudent } from '@/lib/auth/session';
import { cancelDeletion, requestDeletion, setMarketing } from './service';

export async function marketingAction(form: FormData) {
  const user = await requireStudent('/app/privacidade');
  await setMarketing(user.id, form.get('granted') === 'true');
  revalidatePath('/app/privacidade');
}

export async function deletionAction(form: FormData) {
  const user = await requireStudent('/app/privacidade');
  if (form.get('op') === 'cancel') await cancelDeletion(user.id);
  else if (form.get('confirm') === 'EXCLUIR') await requestDeletion(user.id);
  revalidatePath('/app/privacidade');
}
