import type { Metadata } from 'next';
import Link from 'next/link';
import { Library } from '@/components/materials/library';
import { Card } from '@/components/ui/card';
import { requireFeature } from '@/features/flags/service';
import { disciplinesForMaterials, listMaterials } from '@/features/materials/service';
import { requireStudent } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Material de estudo' };

const TABS = [
  { key: 'atual', label: 'Semestre atual' },
  { key: 'anteriores', label: 'Semestres anteriores' },
  { key: 'biblioteca', label: 'Minha biblioteca' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'lixeira', label: 'Lixeira' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// Material de estudo (SPEC v2, 5.10; telas T18 e T19). Um repositório único, privado.
export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  await requireFeature('materiais');
  const user = await requireStudent('/app/materiais');
  const { aba } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === aba) ? (aba as Tab) : 'atual';
  const [{ items }, disciplines] = await Promise.all([
    listMaterials(user.id, { tab }),
    disciplinesForMaterials(user.id),
  ]);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-3xl md:text-4xl">Material de estudo</h1>
          <p className="text-muted">
            Slides, apostilas, atividades e provas, num lugar só. Só você vê.
          </p>
        </div>
        <Link href="/app/busca" className="text-sm">
          Buscar nos materiais (Ctrl+K)
        </Link>
      </div>
      {disciplines.length ? (
        <Card as="section" aria-label="Conteúdo de aula por disciplina" className="grid gap-2">
          <p className="font-semibold">Conteúdo de aula</p>
          <ul className="flex flex-wrap gap-2">
            {disciplines.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/materiais/disciplina/${d.id}`}
                  className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-line px-3 no-underline"
                >
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <nav aria-label="Abas" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/materiais?aba=${t.key}`}
            aria-current={t.key === tab ? 'page' : undefined}
            className={cn(
              'min-h-11 rounded-[var(--radius)] border px-4 py-2 no-underline',
              t.key === tab ? 'border-accent bg-accent text-accent-ink' : 'border-line',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Library items={items} tab={tab} disciplines={disciplines} />
    </div>
  );
}
