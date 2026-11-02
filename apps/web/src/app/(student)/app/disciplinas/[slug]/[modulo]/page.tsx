import { withUser } from '@gutta/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/shared/markdown';
import { buttonClass } from '@/components/ui/button';
import { Alert, Card, DemoBadge } from '@/components/ui/card';
import { embeddableLesson, getModule } from '@/features/catalog/data';
import { requireStudent } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { track } from '@/lib/events';

export const metadata: Metadata = { title: 'Módulo' };

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string; modulo: string }>;
}) {
  const { slug, modulo } = await params;
  const user = await requireStudent(`/app/disciplinas/${slug}/${modulo}`);
  const data = await getModule(user.id, slug, modulo);
  if (!data) notFound();
  const { discipline, module: m } = data;
  const lesson = embeddableLesson(m.lessonUrl);
  await withUser(db(), user.id, (tx) => track(tx, user.id, 'module_opened', { moduleId: m.id }));

  return (
    <div className="grid gap-6">
      <nav aria-label="Trilha" className="text-sm">
        <Link href="/app/disciplinas">Estudar</Link> <span className="text-muted">/</span>{' '}
        <Link href={`/app/disciplinas/${slug}`}>{discipline.name}</Link>{' '}
        <span className="text-muted">/</span> <span aria-current="page">{m.title}</span>
      </nav>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">{m.title}</h1>
          {m.isDemo ? <DemoBadge /> : null}
        </div>
        {m.lead ? <p className="text-lg text-muted">{m.lead}</p> : null}
      </header>

      {/* Ação principal do módulo logo no topo (Posição Serial); repetida no fim. */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/app/questoes/nova?modulo=${m.id}`} className={buttonClass('primary', 'lg')}>
          Praticar com questões
        </Link>
        <Link href="/app/revisoes" className={buttonClass('secondary', 'lg')}>
          Revisar flashcards
        </Link>
      </div>

      <section aria-labelledby="aula" className="grid gap-3">
        <h2 id="aula" className="text-xl font-bold">
          Aula interativa
        </h2>
        {lesson?.embed ? (
          <>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
              <iframe
                src={lesson.url}
                title={`Aula interativa: ${m.title}`}
                className="aspect-[4/5] w-full sm:aspect-video"
                sandbox="allow-scripts allow-same-origin allow-popups"
                allow="fullscreen; xr-spatial-tracking"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
            <a
              href={lesson.url}
              target="_blank"
              rel="noopener noreferrer"
              className="justify-self-start text-sm"
            >
              Abrir a aula em tela cheia
            </a>
          </>
        ) : lesson ? (
          <a
            href={lesson.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('secondary')}
          >
            Abrir a aula interativa
          </a>
        ) : (
          <Alert>
            A aula interativa deste módulo está em produção. O resumo e as questões já estão
            disponíveis.
          </Alert>
        )}
      </section>

      {m.summaryMd ? (
        <Card as="section" aria-labelledby="resumo">
          <h2 id="resumo" className="text-xl font-bold">
            Resumo
          </h2>
          <div className="mt-3">
            <Markdown source={m.summaryMd} />
          </div>
          <p className="mt-4 text-xs text-muted">
            Versão {m.version}
            {m.publishedAt
              ? ` · publicado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(m.publishedAt)}`
              : ''}
            {m.isDemo ? ' · sem revisão editorial' : ''}
          </p>
        </Card>
      ) : null}

      <div>
        <Link href={`/app/questoes/nova?modulo=${m.id}`} className={buttonClass('primary', 'lg')}>
          Praticar com questões
        </Link>
      </div>
    </div>
  );
}
