import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { requireFeature } from '@/features/flags/service';
import { search } from '@/features/materials/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Busca' };

const KIND = { material: 'Material', pagina: 'Página', lembrete: 'Lembrete' } as const;

/** Trecho com as palavras encontradas destacadas (o serviço marca com « »). */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <p className="text-sm">
      {parts.map((p, i) =>
        p.startsWith('«') ? (
          <mark key={i} className="rounded-[2px] bg-accent-soft px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

// Busca por palavra nos materiais e lembretes (SPEC v2, MAT-09; ADR 0014). Sem acento.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireFeature('materiais');
  const user = await requireStudent('/app/busca');
  const { q = '' } = await searchParams;
  const term = q.trim().slice(0, 200);
  const result = term.length >= 2 ? await search(user.id, { q: term }) : null;
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl md:text-4xl">Busca</h1>
      <form method="get" action="/app/busca" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar nos materiais e lembretes
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          // A busca é a ação principal desta página (o Ctrl+K traz para cá).
          autoFocus
          placeholder="Ex.: inflamação crônica"
          className="min-h-11 flex-1 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-4"
        />
        <Button type="submit">Buscar</Button>
      </form>
      {term.length === 1 ? <Alert>Digite pelo menos duas letras.</Alert> : null}
      {result ? (
        result.items.length === 0 ? (
          <p>Nada encontrado para “{term}”.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Resultados">
            {result.items.map((h, i) => (
              <li key={`${h.kind}-${h.materialId}-${h.page}-${i}`}>
                <Card className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{KIND[h.kind]}</Badge>
                    <Link href={h.link} className="font-semibold">
                      {h.title}
                      {h.page ? `, página ${h.page}` : ''}
                    </Link>
                  </div>
                  {h.snippet ? <Snippet text={h.snippet} /> : null}
                  {h.disciplineName ? (
                    <p className="text-sm text-muted">{h.disciplineName}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
