'use server';
import { redirect } from 'next/navigation';
import { requireStudent } from '@/lib/auth/session';
import { changeMainGoal } from './service';

/** Alterar objetivo principal (CAD-03, ESP-01). */
export async function changeGoalAction(form: FormData) {
  const user = await requireStudent('/app/objetivo');
  const ok = await changeMainGoal(user.id, String(form.get('mainGoal') ?? ''));
  redirect(ok ? '/app?objetivo=1' : '/app/objetivo?erro=1');
}
