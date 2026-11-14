import {
  BarChart3,
  BadgeDollarSign,
  Building2,
  FileQuestion,
  GraduationCap,
  LayoutGrid,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';
import { SideNav, type NavItem } from '@/components/layout/nav-links';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Badge } from '@/components/ui/card';
import { ROLE_LABEL } from '@/features/admin/service';
import { EDITORIAL_ROLES, requireRole } from '@/lib/auth/session';

const icon = 'size-5';
const items: NavItem[] = [
  {
    href: '/admin',
    label: 'Visão geral',
    icon: <LayoutGrid className={icon} aria-hidden />,
    exact: true,
  },
  {
    href: '/admin/questoes',
    label: 'Questões',
    icon: <FileQuestion className={icon} aria-hidden />,
  },
];
// Só admin: catálogo, pessoas, instituições e métricas da empresa.
const adminItems: NavItem[] = [
  { href: '/admin/cursos', label: 'Cursos', icon: <GraduationCap className={icon} aria-hidden /> },
  { href: '/admin/usuarios', label: 'Usuários', icon: <Users className={icon} aria-hidden /> },
  {
    href: '/admin/instituicoes',
    label: 'Instituições',
    icon: <Building2 className={icon} aria-hidden />,
  },
  { href: '/admin/tutor', label: 'Tutor IA', icon: <Sparkles className={icon} aria-hidden /> },
  {
    href: '/admin/ia',
    label: 'Custos de IA',
    icon: <BadgeDollarSign className={icon} aria-hidden />,
  },
  {
    href: '/admin/privacidade',
    label: 'Privacidade',
    icon: <LockKeyhole className={icon} aria-hidden />,
  },
  { href: '/admin/metricas', label: 'Métricas', icon: <BarChart3 className={icon} aria-hidden /> },
];
const tailItems: NavItem[] = [
  {
    href: '/seguranca/dois-fatores',
    label: 'Segurança',
    icon: <ShieldCheck className={icon} aria-hidden />,
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(EDITORIAL_ROLES, '/admin');
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl gap-6 px-4 py-4 sm:px-6 md:grid-cols-[220px_1fr]">
      <aside className="grid content-start gap-4 md:sticky md:top-4 md:h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between md:block">
          <Link href="/app" className="text-fg no-underline">
            <Wordmark />
          </Link>
          <div className="mt-2 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r} tone="accent">
                {ROLE_LABEL[r]}
              </Badge>
            ))}
          </div>
        </div>
        <SideNav
          items={[...items, ...(user.roles.includes('admin') ? adminItems : []), ...tailItems]}
        />
        <div className="hidden md:block">
          <SignOutButton />
        </div>
      </aside>
      <main id="conteudo" className="min-w-0 pb-10">
        {children}
      </main>
    </div>
  );
}
