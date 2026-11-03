'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireRole, requireStudent } from '@/lib/auth/session';
import * as svc from './service';

function message(err: unknown) {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Confira os campos.';
  if (err instanceof ApiError) return err.message;
  throw err;
}
function back(path: string, q: Record<string, string>): never {
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(q)}`);
}
const TEACHER = ['teacher', 'admin'] as const;

export async function createClassAction(form: FormData) {
  const user = await requireRole([...TEACHER], '/professor');
  let id = '';
  try {
    id = (await svc.createClass(user, Object.fromEntries(form))).id;
  } catch (err) {
    back('/professor', { erro: message(err) });
  }
  back(`/professor/turmas/${id}`, { ok: 'Turma criada. Passe o código para os alunos.' });
}

export async function updateClassAction(form: FormData) {
  const user = await requireRole([...TEACHER], '/professor');
  const id = z.uuid().parse(String(form.get('id')));
  const op = String(form.get('op'));
  const path = `/professor/turmas/${id}`;
  try {
    if (op === 'codigo') await svc.updateClass(user, id, { newCode: true });
    else if (op === 'encerrar') await svc.updateClass(user, id, { active: false });
    else if (op === 'reabrir') await svc.updateClass(user, id, { active: true });
    else if (op === 'remover')
      await svc.removeStudent(user, id, z.string().min(1).parse(form.get('studentId')));
  } catch (err) {
    back(path, { erro: message(err) });
  }
  const ok =
    op === 'codigo'
      ? 'Código novo gerado. O antigo não funciona mais.'
      : op === 'encerrar'
        ? 'Turma encerrada para novas entradas.'
        : op === 'reabrir'
          ? 'Turma reaberta.'
          : 'Aluno removido da turma.';
  back(path, { ok });
}

export async function joinClassAction(form: FormData) {
  const user = await requireStudent('/app/perfil');
  try {
    await svc.joinClass(user, { code: form.get('code') });
  } catch (err) {
    back('/app/perfil', { turma_erro: message(err) });
  }
  back('/app/perfil', { turma_ok: 'Você entrou na turma.' });
}

export async function leaveClassAction(form: FormData) {
  const user = await requireStudent('/app/perfil');
  await svc.leaveClass(user, z.uuid().parse(String(form.get('id'))));
  back('/app/perfil', {
    turma_ok: 'Você saiu da turma. O professor não vê mais o seu desempenho.',
  });
}
