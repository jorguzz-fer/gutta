import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { requireRole } from '@/lib/auth/session';

// Área do professor: turmas e desempenho. Papel professor (ou admin, com 2FA).
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['teacher', 'admin'], '/professor');
  return (
    <div className="min-h-dvh">
      <header className="glass-bar sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 md:px-8">
          <div className="flex items-center gap-6">
            <Link
              href="/professor"
              className="no-underline"
              aria-label="Cognuss, painel do professor"
            >
              <Wordmark className="text-[26px]" />
            </Link>
            <span className="text-sm font-semibold tracking-widest text-muted uppercase">
              Professor
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-sm">
              Área do aluno
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        {children}
      </main>
    </div>
  );
}
