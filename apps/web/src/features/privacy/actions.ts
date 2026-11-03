'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireStudent, requireUser } from '@/lib/auth/session';
import {
  acceptPolicy,
  cancelDeletion,
  cancelRequest,
  OPTIONAL_PURPOSES,
  redactTutorHistory,
  requestDeletion,
  requestRight,
  setConsent,
} from './service';

const PATH = '/app/privacidade';

function back(result: { ok?: string; erro?: string }): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams(result as Record<string, string>).toString()}`);
}

export async function consentAction(form: FormData) {
  const user = await requireStudent(PATH);
  const purpose = z.enum(OPTIONAL_PURPOSES).parse(form.get('purpose'));
  const granted = form.get('granted') === 'true';
  await setConsent(user.id, purpose, granted);
  back({ ok: granted ? 'Autorização registrada.' : 'Autorização retirada.' });
}

export async function deletionAction(form: FormData) {
  const user = await requireStudent(PATH);
  if (form.get('op') === 'cancel') {
    await cancelDeletion(user.id);
    back({ ok: 'Pedido de exclusão cancelado.' });
  }
  if (form.get('confirm') !== 'EXCLUIR') back({ erro: 'Digite EXCLUIR para confirmar.' });
  await requestDeletion(user.id);
  back({ ok: 'Pedido de exclusão registrado.' });
}

export async function rightRequestAction(form: FormData) {
  const user = await requireStudent(PATH);
  try {
    await requestRight(user.id, { kind: form.get('kind'), details: form.get('details') });
  } catch (err) {
    if (err instanceof z.ZodError) back({ erro: err.issues[0]?.message ?? 'Confira o pedido.' });
    if (err instanceof ApiError) back({ erro: err.message });
    throw err;
  }
  back({ ok: 'Pedido registrado. A resposta aparece aqui em até 15 dias.' });
}

export async function cancelRequestAction(form: FormData) {
  const user = await requireStudent(PATH);
  await cancelRequest(user.id, z.uuid().parse(form.get('id')));
  back({ ok: 'Pedido cancelado.' });
}

export async function redactTutorAction() {
  const user = await requireStudent(PATH);
  const n = await redactTutorHistory(user.id);
  back({ ok: n ? `Texto de ${n} mensagens apagado.` : 'Não havia mensagens para apagar.' });
}

/** Aceite da nova versão dos termos e da política (aviso no topo do app). */
export async function acceptPolicyAction(form: FormData) {
  const user = await requireUser('/app');
  await acceptPolicy(user.id);
  const next = String(form.get('next') ?? '/app');
  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/app');
}
