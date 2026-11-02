import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/states';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listDisciplines } from '@/features/catalog/data';
import { recentSessions } from '@/features/questions/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Questões' };

const MODE = { practice: 'Treino', diagnostic: 'Diagnóstico', daily: 'Questão do dia' } as const;

export default async function QuestionsPage() {
  const user = await requireStudent('/app/questoes');
  const [{ mine }, sessions] = await Promise.all([
    listDisciplines(user.id),
    recentSessions(user.id),
  ]);
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <h1 className="text-3xl font-bold">Questões</h1>
        <p className="text-muted">
          5 questões escolhidas pelo que você mais precisa agora, nas suas disciplinas.
        </p>
        <div>
          <Link href="/app/questoes/nova" className={buttonClass('primary', 'lg')}>
            Começar 5 questões
          </Link>
        </div>
      </div>

      {mine.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="por-disciplina">
          <h2 id="por-disciplina" className="text-xl font-bold">
            Por disciplina
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.map((d) => (
              <Card as="li" key={d.id} className="grid gap-3">
                <h3 className="font-bold">{d.name}</h3>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/questoes/nova?disciplina=${d.id}`}
                    className={buttonClass('secondary')}
                  >
                    Treinar
                  </Link>
                  <Link
                    href={`/app/questoes/nova?disciplina=${d.id}&modo=diagnostico`}
                    className={buttonClass('ghost')}
                  >
                    Diagnóstico (8)
                  </Link>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="historico">
        <h2 id="historico" className="text-xl font-bold">
          Histórico
        </h2>
        {sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão ainda">
            Suas sessões aparecem aqui, com acertos e o que retomar.
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/app/questoes/sessao/${s.id}`}
                  className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-surface px-4 py-2 text-fg no-underline hover:border-line-strong"
                >
                  <span>
                    <span className="font-medium">{MODE[s.mode]}</span>{' '}
                    <span className="text-sm text-muted">· {fmt.format(s.startedAt)}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {s.finishedAt
                      ? `${s.correct} de ${s.answered} certas`
                      : `em andamento · ${s.answered} de ${s.targetCount}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
