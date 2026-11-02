import Link from 'next/link';
import { Wordmark } from '@/components/shared/logo';

export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="pb-8">
        <Link href="/" aria-label="Gutta, página inicial" className="text-fg no-underline">
          <Wordmark />
        </Link>
      </header>
      <main id="conteudo" className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          {lead ? <p className="text-muted">{lead}</p> : null}
        </div>
        {children}
        {footer ? <div className="text-sm text-muted">{footer}</div> : null}
      </main>
    </div>
  );
}
