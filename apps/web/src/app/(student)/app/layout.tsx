import { BookOpen, Home, Layers, ListChecks, User } from 'lucide-react';
import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { BottomNav, TopNav, type NavItem } from '@/components/layout/nav-links';
import { Button } from '@/components/ui/button';
import { acceptPolicyAction } from '@/features/privacy/actions';
import { POLICY_VERSION } from '@/features/privacy/consent';
import { getAccess, hasAnyRole, EDITORIAL_ROLES, requireStudent } from '@/lib/auth/session';

const icon = 'size-5';
const items: NavItem[] = [
  { href: '/app', label: 'Hoje', icon: <Home className={icon} aria-hidden />, exact: true },
  { href: '/app/disciplinas', label: 'Estudar', icon: <BookOpen className={icon} aria-hidden /> },
  { href: '/app/questoes', label: 'Questões', icon: <ListChecks className={icon} aria-hidden /> },
  { href: '/app/revisoes', label: 'Revisões', icon: <Layers className={icon} aria-hidden /> },
  { href: '/app/perfil', label: 'Perfil', icon: <User className={icon} aria-hidden /> },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent('/app');
  const { acceptedPolicy } = await getAccess(user.id);
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="glass-bar sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 md:px-8">
          <div className="flex items-center gap-8">
            <Link href="/app" className="no-underline" aria-label="Gutta, hoje">
              <Wordmark className="text-[26px]" />
            </Link>
            <TopNav items={items.filter((i) => i.href !== '/app/perfil')} />
          </div>
          <div className="flex items-center gap-2">
            {hasAnyRole(user, ['teacher', 'admin']) ? (
              <Link href="/professor" className="hidden text-sm md:inline">
                Professor
              </Link>
            ) : null}
            {hasAnyRole(user, EDITORIAL_ROLES) ? (
              <Link href="/admin" className="hidden text-sm md:inline">
                {user.roles.includes('admin') ? 'Admin' : 'Editorial'}
              </Link>
            ) : null}
            <ThemeToggle />
            <Link
              href="/app/perfil"
              aria-label="Perfil"
              title="Perfil"
              className="hidden size-9 place-items-center rounded-[var(--radius)] bg-accent text-sm font-bold text-accent-ink no-underline md:grid"
            >
              <span aria-hidden>{(user.name || user.email).trim().charAt(0).toUpperCase()}</span>
            </Link>
          </div>
        </div>
      </header>
      {acceptedPolicy !== POLICY_VERSION ? (
        <section aria-label="Nova versão dos termos" className="border-b border-line bg-surface-2">
          <form
            action={acceptPolicyAction}
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6 md:px-8"
          >
            <input type="hidden" name="next" value="/app" />
            <p>
              Atualizamos os <Link href="/termos">termos de uso</Link> e a{' '}
              <Link href="/politica-de-privacidade">política de privacidade</Link> (versão{' '}
              {POLICY_VERSION}). Para continuar, leia e confirme.
            </p>
            <Button type="submit" variant="secondary">
              Li e aceito
            </Button>
          </form>
        </section>
      ) : null}
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8 md:py-10">
        {children}
      </main>
      <BottomNav items={items} />
    </div>
  );
}
