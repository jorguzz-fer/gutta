import 'server-only';
import { eq, schema, withUser } from '@gutta/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from './server';
import { db } from '../db';

export type Role = (typeof schema.appRole.enumValues)[number];

// Uma leitura de sessão por requisição (React cache).
export const getSession = cache(async () => {
  // headers() primeiro: marca a rota como dinâmica antes de tocar em configuração ou banco.
  const h = await headers();
  return auth().api.getSession({ headers: h });
});

export const getRoles = cache(async (userId: string): Promise<Role[]> => {
  const rows = await withUser(db(), userId, (tx) =>
    // Filtro explícito: admin lê os papéis de todos pelo RLS, mas aqui só interessam os dele.
    tx
      .select({ role: schema.roleAssignments.role })
      .from(schema.roleAssignments)
      .where(eq(schema.roleAssignments.userId, userId)),
  );
  return rows.map((r) => r.role);
});

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  roles: Role[];
};

/** Exige sessão válida e e-mail confirmado. Identidade vem só da sessão (SPEC §11). */
export async function requireUser(next = '/app'): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  if (!session.user.emailVerified)
    redirect(`/verificar-email?email=${encodeURIComponent(session.user.email)}`);
  const roles = await getRoles(session.user.id);
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    twoFactorEnabled: Boolean((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled),
    roles,
  };
}

export const EDITORIAL_ROLES: Role[] = ['editor', 'reviewer', 'admin'];

export function hasAnyRole(user: CurrentUser, roles: Role[]) {
  return user.roles.some((r) => roles.includes(r));
}

/** Área administrativa: papel exigido e, para admin, segundo fator ativo (SPEC AUTH-01). */
export async function requireRole(roles: Role[], next = '/admin'): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!hasAnyRole(user, roles)) redirect('/app?aviso=sem-acesso');
  if (user.roles.includes('admin') && !user.twoFactorEnabled) redirect('/seguranca/dois-fatores');
  return user;
}

/** Só aceita caminhos internos em ?next= (evita redirecionamento aberto). */
export function safeNext(next: string | null | undefined, fallback = '/app') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}

/** Aluno com onboarding concluído. Sem perfil acadêmico, vai para /onboarding. */
export async function requireStudent(next = '/app'): Promise<CurrentUser> {
  const user = await requireUser(next);
  const { isOnboarded } = await import('@/features/onboarding/data');
  if (!(await isOnboarded(user.id))) redirect('/onboarding');
  return user;
}
