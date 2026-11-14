'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/session';
import { readAllNotifications, readNotification, savePreferences } from './service';

const hm = (v: FormDataEntryValue | null) =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;

export async function readNotificationAction(form: FormData) {
  const user = await requireStudent('/app/avisos');
  const id = String(form.get('id') ?? '');
  const link = String(form.get('link') ?? '');
  await readNotification(user.id, id).catch(() => undefined);
  revalidatePath('/app', 'layout');
  // Só links internos.
  if (link.startsWith('/app')) redirect(link);
}

export async function readAllAction() {
  const user = await requireStudent('/app/avisos');
  await readAllNotifications(user.id);
  revalidatePath('/app', 'layout');
}

export async function savePreferencesAction(form: FormData) {
  const user = await requireStudent('/app/avisos');
  const quiet = form.get('quiet') === 'on';
  const from = quiet ? hm(form.get('quietFrom')) : null;
  const until = quiet ? hm(form.get('quietUntil')) : null;
  const cap = Math.min(50, Math.max(1, Number(form.get('dailyCap')) || 10));
  await savePreferences(user.id, {
    emailEnabled: form.get('emailEnabled') === 'on',
    quietFrom: from && until ? from : null,
    quietUntil: from && until ? until : null,
    dailyCap: cap,
    academicAlerts: form.get('academicAlerts') === 'on',
  });
  redirect('/app/avisos?salvo=1');
}
