import Link from 'next/link';
import { Wordmark } from './logo';
import { Alert } from '@/components/ui/card';
import { POLICY_VERSION } from '@/features/privacy/consent';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="text-fg no-underline">
        <Wordmark />
      </Link>
      <main
        id="conteudo"
        className="mt-8 grid gap-4 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[15px] [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pr-3 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-widest [&_th]:text-muted [&_th]:uppercase"
      >
        <h1 className="text-3xl font-bold">{title}</h1>
        <Alert tone="warn">
          Rascunho em revisão jurídica (versão {POLICY_VERSION}). O texto final será publicado antes
          do piloto.
        </Alert>
        {children}
      </main>
    </div>
  );
}
