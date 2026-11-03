'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { requireRole, type Role } from '@/lib/auth/session';
import * as svc from './service';

/*
  Ações do admin. Formulários simples (sem estado no cliente): cada ação valida, chama o
  serviço e volta para a página com ?ok= ou ?erro=. A permissão é conferida aqui
  (requireRole) e de novo no banco (RLS).
*/

const obj = (form: FormData) => Object.fromEntries(form.entries());
const id = (form: FormData, key = 'id') => z.uuid().parse(String(form.get(key) ?? ''));

function message(err: unknown) {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Confira os campos.';
  if (err instanceof ApiError) return err.message;
  throw err;
}

function back(path: string, result: { ok?: string; erro?: string }): never {
  const q = new URLSearchParams(result as Record<string, string>).toString();
  revalidatePath(path);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${q}`);
}

async function admin(next: string) {
  return requireRole(['admin'], next);
}

// ── Catálogo ──────────────────────────────────────────────────────────────

export async function saveCourseAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const courseId = String(form.get('id') ?? '') || null;
  let target = '/admin/cursos';
  try {
    const row = await svc.saveCourse(user, courseId, obj(form));
    target = `/admin/cursos/${row.id}`;
  } catch (err) {
    back(courseId ? `/admin/cursos/${courseId}` : '/admin/cursos', { erro: message(err) });
  }
  back(target, { ok: courseId ? 'Curso salvo.' : 'Curso criado.' });
}

export async function saveDisciplineAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const disciplineId = String(form.get('id') ?? '') || null;
  const courseId = String(form.get('courseId') ?? '');
  let target = `/admin/cursos/${courseId}`;
  try {
    const row = await svc.saveDiscipline(
      user,
      disciplineId ? { id: disciplineId } : { courseId: z.uuid().parse(courseId) },
      obj(form),
    );
    target = `/admin/disciplinas/${row.id}`;
  } catch (err) {
    back(disciplineId ? `/admin/disciplinas/${disciplineId}` : target, { erro: message(err) });
  }
  back(target, { ok: disciplineId ? 'Disciplina salva.' : 'Disciplina criada.' });
}

export async function saveTopicAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const disciplineId = id(form, 'disciplineId');
  const topicId = String(form.get('id') ?? '') || null;
  const path = `/admin/disciplinas/${disciplineId}`;
  try {
    await svc.saveTopic(user, topicId ? { id: topicId } : { disciplineId }, obj(form));
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: topicId ? 'Assunto salvo.' : 'Assunto criado.' });
}

export async function deleteTopicAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const disciplineId = id(form, 'disciplineId');
  const path = `/admin/disciplinas/${disciplineId}`;
  try {
    await svc.deleteTopic(user, id(form));
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: 'Assunto excluído.' });
}

export async function saveModuleAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const moduleId = String(form.get('id') ?? '') || null;
  const disciplineId = String(form.get('disciplineId') ?? '');
  let target = `/admin/disciplinas/${disciplineId}`;
  try {
    const row = await svc.saveModule(
      user,
      moduleId ? { id: moduleId } : { disciplineId: z.uuid().parse(disciplineId) },
      obj(form),
    );
    target = `/admin/modulos/${row.id}`;
  } catch (err) {
    back(moduleId ? `/admin/modulos/${moduleId}` : target, { erro: message(err) });
  }
  back(target, { ok: moduleId ? 'Módulo salvo.' : 'Módulo criado como rascunho.' });
}

export async function transitionModuleAction(form: FormData) {
  const user = await admin('/admin/cursos');
  const moduleId = id(form);
  const path = `/admin/modulos/${moduleId}`;
  try {
    await svc.transitionModule(user, moduleId, { to: form.get('to') });
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: 'Status do módulo atualizado.' });
}

// ── Instituições ──────────────────────────────────────────────────────────

export async function saveInstitutionAction(form: FormData) {
  const user = await admin('/admin/instituicoes');
  const institutionId = String(form.get('id') ?? '') || null;
  try {
    await svc.saveInstitution(user, institutionId, obj(form));
  } catch (err) {
    back('/admin/instituicoes', { erro: message(err) });
  }
  back('/admin/instituicoes', { ok: institutionId ? 'Instituição salva.' : 'Instituição criada.' });
}

export async function setInstitutionStatusAction(form: FormData) {
  const user = await admin('/admin/instituicoes');
  try {
    const status = z.enum(['active', 'pending', 'rejected']).parse(form.get('status'));
    await svc.setInstitutionStatus(user, id(form), status);
  } catch (err) {
    back('/admin/instituicoes', { erro: message(err) });
  }
  back('/admin/instituicoes', { ok: 'Status atualizado.' });
}

// ── Usuários ──────────────────────────────────────────────────────────────

export async function setRoleAction(form: FormData) {
  const user = await admin('/admin/usuarios');
  const userId = String(form.get('id') ?? '');
  const path = `/admin/usuarios/${userId}`;
  try {
    const role = z.enum(svc.ASSIGNABLE_ROLES as [Role, ...Role[]]).parse(form.get('role'));
    await svc.setRole(user, z.string().min(1).parse(userId), role, form.get('grant') === '1');
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: 'Papéis atualizados.' });
}

export async function verifyEmailAction(form: FormData) {
  const user = await admin('/admin/usuarios');
  const userId = String(form.get('id') ?? '');
  const path = `/admin/usuarios/${userId}`;
  try {
    await svc.verifyEmail(user, z.string().min(1).parse(userId));
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: 'E-mail confirmado.' });
}

export async function revokeSessionsAction(form: FormData) {
  const user = await admin('/admin/usuarios');
  const userId = String(form.get('id') ?? '');
  const path = `/admin/usuarios/${userId}`;
  let n = 0;
  try {
    n = await svc.revokeSessions(user, z.string().min(1).parse(userId));
  } catch (err) {
    back(path, { erro: message(err) });
  }
  back(path, { ok: `${n} ${n === 1 ? 'sessão encerrada' : 'sessões encerradas'}.` });
}
