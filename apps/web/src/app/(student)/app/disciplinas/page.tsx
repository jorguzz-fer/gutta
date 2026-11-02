import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/states';
import { Card, DemoBadge } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { listDisciplines } from '@/features/catalog/data';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Estudar' };

type D = Awaited<ReturnType<typeof listDisciplines>>['mine'][number];

function DisciplineCard({ d }: { d: D }) {
  return (
    <Card as="li" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">
          <Link
            href={`/app/disciplinas/${d.slug}`}
            className="text-fg no-underline after:absolute after:inset-0"
          >
            {d.name}
          </Link>
        </h3>
        {d.isDemo ? <DemoBadge /> : null}
      </div>
      {d.description ? <p className="text-[15px] text-muted">{d.description}</p> : null}
      <p className="font-mono text-xs text-muted">
        {d.moduleCount === 0
          ? 'nenhum módulo publicado ainda'
          : `${d.moduleCount} módulo${d.moduleCount > 1 ? 's' : ''}`}
      </p>
    </Card>
  );
}

export default async function DisciplinesPage() {
  const user = await requireStudent('/app/disciplinas');
  const { mine, others } = await listDisciplines(user.id);
  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-bold">Estudar</h1>
      <section className="grid gap-3" aria-labelledby="minhas">
        <h2 id="minhas" className="text-xl font-bold">
          Suas disciplinas
        </h2>
        {mine.length === 0 ? (
          <EmptyState
            title="Nenhuma disciplina escolhida"
            action={
              <Link href="/app/perfil" className={buttonClass('secondary')}>
                Escolher no perfil
              </Link>
            }
          >
            Escolha o que você está cursando para receber recomendações.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 [&>li]:relative">
            {mine.map((d) => (
              <DisciplineCard key={d.id} d={d} />
            ))}
          </ul>
        )}
      </section>
      {others.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="outras">
          <h2 id="outras" className="text-xl font-bold">
            Outras do seu curso
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 [&>li]:relative">
            {others.map((d) => (
              <DisciplineCard key={d.id} d={d} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
