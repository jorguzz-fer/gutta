import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/shared/states';
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
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">{discipline.name}</h1>
          {discipline.isDemo ? <DemoBadge /> : null}
        </div>
        {discipline.description ? <p className="text-muted">{discipline.description}</p> : null}
      </div>

      <section className="grid gap-3" aria-labelledby="modulos">
        <h2 id="modulos" className="text-xl font-bold">
          Módulos
        </h2>
        {modules.length === 0 ? (
          <EmptyState title="Ainda não há módulos publicados">
            O conteúdo desta disciplina está em produção. Enquanto isso, as questões publicadas já
            aparecem em Questões.
          </EmptyState>
        ) : (
          <ol className="grid gap-3">
            {modules.map((m, i) => (
              <Card as="li" key={m.id} className="relative grid gap-1">
                <span className="font-mono text-xs text-muted">Módulo {i + 1}</span>
                <h3 className="text-lg font-bold">
                  <Link
                    href={`/app/disciplinas/${slug}/${m.slug}`}
                    className="text-fg no-underline after:absolute after:inset-0"
                  >
                    {m.title}
                  </Link>
                </h3>
                {m.lead ? <p className="text-[15px] text-muted">{m.lead}</p> : null}
                <p className="font-mono text-xs text-muted">
                  {m.estMinutes ? `~${m.estMinutes} min` : null}
                  {m.lessonUrl ? ' · aula interativa' : ''}
                  {m.isDemo ? ' · demonstração' : ''}
                </p>
              </Card>
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="assuntos">
        <h2 id="assuntos" className="text-xl font-bold">
          Assuntos
        </h2>
        <ul className="grid gap-1">
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
      </section>
    </div>
  );
}
