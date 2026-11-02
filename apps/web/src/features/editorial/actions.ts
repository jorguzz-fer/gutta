'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { EDITORIAL_ROLES, requireRole } from '@/lib/auth/session';
import {
  createQuestion,
  newVersion,
  questionDraftInput,
  transition,
  transitionInput,
  updateQuestion,
} from './service';

export type EditorialState = { ok: boolean; message?: string; errors?: string[] } | null;

function fail(err: unknown): EditorialState {
  if (err instanceof z.ZodError) return { ok: false, errors: err.issues.map((i) => i.message) };
  if (err instanceof ApiError) return { ok: false, errors: [err.message] };
  throw err;
}

export async function saveQuestionAction(
  _prev: EditorialState,
  form: FormData,
): Promise<EditorialState> {
  const user = await requireRole(EDITORIAL_ROLES, '/admin/questoes');
  let id = String(form.get('id') ?? '');
  try {
    const draft = questionDraftInput.parse(JSON.parse(String(form.get('payload') ?? '{}')));
    if (id) await updateQuestion(user, id, draft);
    else id = (await createQuestion(user, draft)).id;
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/admin/questoes');
  redirect(`/admin/questoes/${id}?salvo=1`);
}

export async function transitionAction(
  _prev: EditorialState,
  form: FormData,
): Promise<EditorialState> {
  const user = await requireRole(EDITORIAL_ROLES, '/admin/questoes');
  const id = String(form.get('id') ?? '');
  try {
    const input = transitionInput.parse({
      to: form.get('to'),
      notes: form.get('notes') ?? undefined,
    });
    await transition(user, z.uuid().parse(id), input);
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/admin/questoes');
  revalidatePath(`/admin/questoes/${id}`);
  return { ok: true, message: 'Status atualizado.' };
}

export async function newVersionAction(
  _prev: EditorialState,
  form: FormData,
): Promise<EditorialState> {
  const user = await requireRole(EDITORIAL_ROLES, '/admin/questoes');
  let target: string;
  try {
    target = (await newVersion(user, z.uuid().parse(String(form.get('id'))))).id;
  } catch (err) {
    return fail(err);
  }
  redirect(`/admin/questoes/${target}`);
}
