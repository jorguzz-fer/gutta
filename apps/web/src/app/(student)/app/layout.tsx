import { BookOpen, Home, Layers, ListChecks, User } from 'lucide-react';
import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';
import { BottomNav, TopNav, type NavItem } from '@/components/layout/nav-links';
import { hasAnyRole, EDITORIAL_ROLES, requireStudent } from '@/lib/auth/session';

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
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="glass-bar sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link href="/app" className="text-fg no-underline" aria-label="Gutta, hoje">
            <Wordmark />
          </Link>
          <TopNav items={items} />
          {hasAnyRole(user, EDITORIAL_ROLES) ? (
            <Link href="/admin" className="hidden text-sm md:inline">
              Editorial
            </Link>
          ) : null}
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {children}
      </main>
      <BottomNav items={items} />
    </div>
  );
}
