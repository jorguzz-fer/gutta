import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/states';
import { Cover } from '@/components/shared/cover';
import { DemoBadge } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { listDisciplines } from '@/features/catalog/data';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Estudar' };

type D = Awaited<ReturnType<typeof listDisciplines>>['mine'][number];

function DisciplineCard({ d }: { d: D }) {
  return (
    <li className="group relative">
      <Cover
        slug={d.slug}
        eyebrow={d.periodHint ? `${d.periodHint}º semestre` : 'Disciplina'}
        title={
          <Link
            href={`/app/disciplinas/${d.slug}`}
            className="text-cover-fg no-underline after:absolute after:inset-0 group-hover:underline"
          >
            {d.name}
          </Link>
        }
        className="transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">
          {d.moduleCount === 0
            ? 'nenhum módulo publicado ainda'
            : `${d.moduleCount} módulo${d.moduleCount > 1 ? 's' : ''}`}
        </p>
        {d.isDemo ? <DemoBadge /> : null}
      </div>
      {d.description ? (
        <p className="mt-1 text-sm text-muted line-clamp-2">{d.description}</p>
      ) : null}
    </li>
  );
}

export default async function DisciplinesPage() {
  const user = await requireStudent('/app/disciplinas');
  const { mine, others } = await listDisciplines(user.id);
  return (
    <div className="grid gap-8">
      <h1 className="text-4xl md:text-5xl">Estudar</h1>
      <section className="grid gap-3" aria-labelledby="minhas">
        <h2 id="minhas" className="text-xl">
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
          <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((d) => (
              <DisciplineCard key={d.id} d={d} />
            ))}
          </ul>
        )}
      </section>
      {others.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="outras">
          <h2 id="outras" className="text-xl">
            Outras do seu curso
          </h2>
          <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((d) => (
              <DisciplineCard key={d.id} d={d} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
