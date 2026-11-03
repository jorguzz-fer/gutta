'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/session';
import { executeDeletion, resolveRequest, runRetention, saveRetention } from './admin';

const PATH = '/admin/privacidade';

function back(result: { ok?: string; erro?: string }): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams(result as Record<string, string>).toString()}`);
}

function message(err: unknown) {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Confira os campos.';
  if (err instanceof ApiError) return err.message;
  throw err;
}

export async function resolveRequestAction(form: FormData) {
  const admin = await requireRole(['admin'], PATH);
  try {
    await resolveRequest(admin, { id: form.get('id'), response: form.get('response') });
  } catch (err) {
    back({ erro: message(err) });
  }
  back({ ok: 'Pedido respondido. A pessoa vê a resposta em Privacidade.' });
}

export async function executeDeletionAction(form: FormData) {
  const admin = await requireRole(['admin'], PATH);
  if (form.get('confirm') !== 'EXCLUIR') back({ erro: 'Digite EXCLUIR para confirmar.' });
  try {
    await executeDeletion(admin, z.string().min(1).parse(form.get('userId')));
  } catch (err) {
    back({ erro: message(err) });
  }
  back({ ok: 'Conta excluída. Ficou só o registro na auditoria.' });
}

export async function saveRetentionAction(form: FormData) {
  const admin = await requireRole(['admin'], PATH);
  try {
    await saveRetention(admin, Object.fromEntries(form));
  } catch (err) {
    back({ erro: message(err) });
  }
  back({ ok: 'Prazos salvos.' });
}

export async function runRetentionAction() {
  const admin = await requireRole(['admin'], PATH);
  let r;
  try {
    r = await runRetention(admin);
  } catch (err) {
    back({ erro: message(err) });
  }
  back({
    ok: `Limpeza feita: ${r.tutorMessagesRedacted} mensagens do tutor apagadas, ${r.eventsDeleted} eventos, ${r.auditDeleted} registros de auditoria, ${r.sessionsDeleted + r.tokensDeleted} sessões e códigos vencidos, ${r.accountsErased} contas excluídas${r.accountsSkipped ? ` (${r.accountsSkipped} de admin ficaram para revisão)` : ''}.`,
  });
}
