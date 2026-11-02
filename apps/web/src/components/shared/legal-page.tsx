import Link from 'next/link';
import { Wordmark } from './logo';
import { Alert } from '@/components/ui/card';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="text-fg no-underline">
        <Wordmark />
      </Link>
      <main
        id="conteudo"
        className="mt-8 grid gap-4 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc"
      >
        <h1 className="text-3xl font-bold">{title}</h1>
        <Alert tone="warn">
          Rascunho em revisão jurídica (versão 2026-11-rascunho). O texto final será publicado antes
          do piloto.
        </Alert>
        {children}
      </main>
    </div>
  );
}
