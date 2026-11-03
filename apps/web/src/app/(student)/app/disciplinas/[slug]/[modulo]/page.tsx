import { withUser } from '@gutta/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/shared/markdown';
import { buttonClass } from '@/components/ui/button';
import { Alert, Card, DemoBadge } from '@/components/ui/card';
import { TutorChat } from '@/components/tutor/tutor-chat';
import { embeddableLesson, getModule } from '@/features/catalog/data';
import { getTutorState } from '@/features/tutor/service';
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
  const tutor = await getTutorState(user, m.id);
  const path = `/app/disciplinas/${slug}/${modulo}`;

  const actions = (
    <>
      <Link href={`/app/questoes/nova?modulo=${m.id}`} className={buttonClass('primary', 'lg')}>
        Praticar com questões
      </Link>
      <Link href="/app/revisoes" className={buttonClass('secondary', 'lg')}>
        Revisar flashcards
      </Link>
    </>
  );

  return (
    <div className="grid gap-8">
      <nav aria-label="Trilha" className="text-sm">
        <Link href="/app/disciplinas">Estudar</Link> <span className="text-muted">/</span>{' '}
        <Link href={`/app/disciplinas/${slug}`}>{discipline.name}</Link>{' '}
        <span className="text-muted">/</span> <span aria-current="page">{m.title}</span>
      </nav>

      <header className="grid gap-3">
        <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">
          {discipline.name}
          {m.estMinutes ? ` · ~${m.estMinutes} min` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl md:text-6xl">{m.title}</h1>
          {m.isDemo ? <DemoBadge /> : null}
        </div>
        {m.lead ? <p className="max-w-[60ch] text-lg text-muted">{m.lead}</p> : null}
        {/* No celular a ação principal vem logo no topo (Posição Serial); no desktop fica ao lado. */}
        <div className="flex flex-wrap gap-3 pt-1 lg:hidden">{actions}</div>
      </header>

      <section aria-labelledby="aula" className="grid gap-3">
        <h2 id="aula" className="sr-only">
          Aula interativa
        </h2>
        {lesson?.embed ? (
          <>
            <div className="glass-card overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-card">
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

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {m.summaryMd ? (
          <section aria-labelledby="resumo" className="min-w-0">
            <h2 id="resumo" className="text-2xl">
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
          </section>
        ) : (
          <div />
        )}
        <Card
          as="aside"
          aria-labelledby="praticar"
          className="grid content-start gap-3 lg:sticky lg:top-24"
        >
          <h2 id="praticar" className="text-lg">
            Depois da aula
          </h2>
          <p className="text-sm text-muted">
            Questões comentadas deste módulo e os flashcards do dia, no tempo que você tiver.
          </p>
          <div className="grid gap-2 [&>a]:w-full">{actions}</div>
        </Card>
      </div>

      <Card as="section" aria-labelledby="tutor" className="grid gap-3">
        <h2 id="tutor" className="flex items-center gap-2 text-xl">
          Tutor IA{' '}
          <span className="text-xs font-semibold tracking-widest text-muted uppercase">beta</span>
        </h2>
        <TutorChat moduleId={m.id} path={path} {...tutor} />
      </Card>
    </div>
  );
}
