import { FolderOpen, Library, Sparkles, CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { listCreations } from '@/features/ajuda/service';
import { featureEnabled, requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Ajuda Cognuss' };

const TYPE_LABEL = {
  resumo: 'Resumo',
  flashcards: 'Flashcards',
  questoes: 'Questões',
  mapa: 'Mapa mental',
  roteiro: 'Roteiro',
} as const;

// Ajuda Cognuss (SPEC v2, 5.14; tela T25): central que transforma o acervo do aluno em
// recursos de estudo. Só aparecem as áreas que já funcionam.
export default async function AjudaPage() {
  await requireFeature('ajuda');
  const user = await requireStudent('/app/ajuda');
  const [{ items }, materiais] = await Promise.all([
    listCreations(user.id, {}),
    featureEnabled('materiais'),
  ]);
  const tiles = [
    materiais ? { href: '/app/materiais', label: 'Minha biblioteca', Icon: Library } : null,
    { href: '/app/ajuda/criar', label: 'Criar com IA', Icon: Sparkles },
    { href: '/app/ajuda/criacoes', label: 'Minhas criações', Icon: FolderOpen },
    { href: '/app/revisoes', label: 'Revisões', Icon: CalendarCheck },
  ].filter((t): t is NonNullable<typeof t> => Boolean(t));
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl md:text-4xl">Ajuda Cognuss</h1>
        <p className="text-muted">
          Resumos, flashcards, questões, mapas e roteiros feitos a partir dos seus materiais, com a
          página de origem de cada trecho.
        </p>
      </div>
      <nav aria-label="Áreas da Ajuda Cognuss">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="grid min-h-24 place-items-center gap-2 rounded-[var(--radius)] border border-line bg-surface p-4 text-center font-semibold no-underline hover:border-accent"
              >
                <Icon className="size-6 text-accent" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Card as="section" aria-labelledby="recentes" className="grid gap-3">
        <h2 id="recentes" className="text-lg font-semibold">
          Criações recentes
        </h2>
        {items.length === 0 ? (
          <p className="text-sm">
            Nada criado ainda. <Link href="/app/ajuda/criar">Criar a primeira</Link>.
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.slice(0, 5).map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/app/ajuda/criacoes/${c.id}`}>{c.title}</Link>
                <span className="text-sm text-muted">
                  {TYPE_LABEL[c.type]}
                  {c.disciplineName ? ` · ${c.disciplineName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
