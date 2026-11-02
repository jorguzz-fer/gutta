'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';
import { createFlashcard, deletePersonal } from './service';

export type CardFormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
} | null;

const schema = z.object({
  front: z.string().trim().min(2, 'Escreva a frente do cartão.').max(500, 'Até 500 caracteres.'),
  back: z.string().trim().min(1, 'Escreva o verso do cartão.').max(2000, 'Até 2000 caracteres.'),
});

export async function createCardAction(
  _prev: CardFormState,
  form: FormData,
): Promise<CardFormState> {
  const user = await requireStudent('/app/flashcards');
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }
  await createFlashcard(user.id, parsed.data);
  revalidatePath('/app/flashcards');
  return { ok: true, message: 'Cartão criado. A primeira revisão é amanhã.' };
}

export async function deleteCardAction(form: FormData) {
  const user = await requireStudent('/app/flashcards');
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return;
  try {
    await deletePersonal(user.id, id.data);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }
  revalidatePath('/app/flashcards');
}
