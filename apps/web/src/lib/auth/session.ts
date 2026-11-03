import 'server-only';
import { latestConsent } from '@/features/privacy/consent';
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

/**
 * Papéis e status do onboarding numa transação só, uma vez por requisição (React cache).
 * O layout e a página pedem os dois; antes eram até 3 transações por página (teste de carga).
 */
export const getAccess = cache(async (userId: string) => {
  return withUser(db(), userId, async (tx) => {
    // Filtro explícito: admin lê os papéis de todos pelo RLS, mas aqui só interessam os dele.
    const roles = await tx
      .select({ role: schema.roleAssignments.role })
      .from(schema.roleAssignments)
      .where(eq(schema.roleAssignments.userId, userId));
    const profile = await tx.query.studentProfiles.findFirst({
      where: eq(schema.studentProfiles.userId, userId),
      columns: { onboardingCompletedAt: true },
    });
    // Versão dos termos aceita por último: se mudou, o app pede o aceite da nova.
    const terms = await latestConsent(tx, userId, 'terms');
    return {
      roles: roles.map((r) => r.role as Role),
      onboarded: Boolean(profile?.onboardingCompletedAt),
      acceptedPolicy: terms?.granted ? terms.version : null,
    };
  });
});

export async function getRoles(userId: string): Promise<Role[]> {
  return (await getAccess(userId)).roles;
}

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
  if (!(await getAccess(user.id)).onboarded) redirect('/onboarding');
  return user;
}
