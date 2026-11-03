import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/shared/states';
import { Cover, coverHue } from '@/components/shared/cover';
import { Card, DemoBadge } from '@/components/ui/card';
import { getDiscipline } from '@/features/catalog/data';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Disciplina' };

export default async function DisciplinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireStudent(`/app/disciplinas/${slug}`);
  const data = await getDiscipline(user.id, slug);
  if (!data) notFound();
  const { discipline, modules, topics } = data;
  const roots = topics.filter((t) => !t.parentId);
  return (
    <div className="grid gap-6">
      <nav aria-label="Trilha" className="text-sm">
        <Link href="/app/disciplinas">Estudar</Link> <span className="text-muted">/</span>{' '}
        <span aria-current="page">{discipline.name}</span>
      </nav>
      <header
        className="course-cover relative overflow-hidden rounded-[var(--radius)] px-6 py-10 md:px-10 md:py-14"
        style={{ '--course-hue': coverHue(discipline.slug) } as React.CSSProperties}
      >
        <p className="text-xs font-semibold tracking-[0.25em] text-cover-muted uppercase">
          {discipline.periodHint ? `${discipline.periodHint}º semestre · ` : ''}
          {modules.length} módulo{modules.length === 1 ? '' : 's'}
        </p>
        <h1 className="mt-2 text-4xl text-cover-fg md:text-6xl">{discipline.name}</h1>
        {discipline.description ? (
          <p className="mt-3 max-w-[60ch] text-cover-muted">{discipline.description}</p>
        ) : null}
        {discipline.isDemo ? (
          <div className="mt-4">
            <DemoBadge />
          </div>
        ) : null}
      </header>

      <section className="grid gap-3" aria-labelledby="modulos">
        <h2 id="modulos" className="text-xl">
          Módulos
        </h2>
        {modules.length === 0 ? (
          <EmptyState title="Ainda não há módulos publicados">
            O conteúdo desta disciplina está em produção. Enquanto isso, as questões publicadas já
            aparecem em Questões.
          </EmptyState>
        ) : (
          <ol className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m, i) => (
              <li key={m.id} className="group relative">
                <Cover
                  slug={`${discipline.slug}-${m.slug}`}
                  eyebrow={`Módulo ${i + 1}${m.lessonUrl ? ' · aula interativa' : ''}`}
                  title={
                    <Link
                      href={`/app/disciplinas/${slug}/${m.slug}`}
                      className="text-cover-fg no-underline after:absolute after:inset-0 group-hover:underline"
                    >
                      {m.title}
                    </Link>
                  }
                  className="transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <p className="mt-2 text-sm text-muted">
                  {m.estMinutes ? `~${m.estMinutes} min` : null}
                  {m.isDemo ? ' · demonstração' : ''}
                </p>
                {m.lead ? <p className="mt-1 text-sm text-muted">{m.lead}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Card as="section" className="grid gap-3" aria-labelledby="assuntos">
        <h2 id="assuntos" className="text-xl">
          Assuntos
        </h2>
        <ul className="grid gap-1.5">
          {roots.map((t) => (
            <li key={t.id}>
              <span className="font-medium">{t.name}</span>
              {topics.some((c) => c.parentId === t.id) ? (
                <ul className="mt-1 ml-5 list-disc text-[15px] text-muted">
                  {topics
                    .filter((c) => c.parentId === t.id)
                    .map((c) => (
                      <li key={c.id}>{c.name}</li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
