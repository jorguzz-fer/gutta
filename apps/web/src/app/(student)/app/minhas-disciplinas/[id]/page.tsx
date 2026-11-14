import { formatGrade } from '@gutta/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DownloadButton } from '@/components/files/download-button';
import { Badge, Card } from '@/components/ui/card';
import { getAttendance } from '@/features/attendance/service';
import { disciplineOverview } from '@/features/discipline-overview/service';
import { requireFeature } from '@/features/flags/service';
import { getGrades } from '@/features/grades/service';
import { ApiError } from '@/lib/api';
import { requireStudent } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { categoryClasses, type CategoryColor } from '@/styles/categories';

export const metadata: Metadata = { title: 'Disciplina' };

const DAY = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const LONG = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const TYPE: Record<string, { label: string; tone: 'accent' | 'danger' | 'neutral' }> = {
  aula: { label: 'Aula', tone: 'accent' },
  pratica: { label: 'Prática', tone: 'accent' },
  outro: { label: 'Outro', tone: 'neutral' },
  prova: { label: 'Prova', tone: 'danger' },
  atividade: { label: 'Atividade', tone: 'neutral' },
  entrega: { label: 'Entrega', tone: 'neutral' },
};

/*
  Visão geral da disciplina (SPEC v2, DSC-01 a DSC-06; tela T11). Cada cartão leva ao módulo
  dele. Sem cronograma ou sem configuração, o cartão diz o que falta. O progresso segue a
  seção 6.4 (D13) e só aparece com o Acompanhar Aula ligado.
*/
export default async function DisciplineOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature('disciplinas');
  const { id } = await params;
  const user = await requireStudent(`/app/minhas-disciplinas/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const o = await disciplineOverview(user.id, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const d = o.discipline;
  const attendance = o.flags.faltas ? (await getAttendance(user.id, id)).attendance : null;
  const grades = o.flags.notas ? (await getGrades(user.id, id)).grades : null;

  const menu = [
    { href: `/app/minhas-disciplinas/${id}`, label: 'Visão geral', on: true, current: true },
    {
      href: `/app/agenda?visao=mes&disciplina=${id}`,
      label: 'Calendário da disciplina',
      on: o.flags.agenda,
    },
    { href: '/app/lembretes', label: 'Lembretes', on: o.flags.lembretes },
    { href: `/app/faltas/${id}`, label: 'Faltas', on: o.flags.faltas },
    { href: `/app/notas/${id}`, label: 'Notas e calculadora', on: o.flags.notas },
    {
      href: `/app/materiais/disciplina/${id}`,
      label: 'Conteúdo de aula',
      on: o.flags.materiais,
    },
    { href: `/app/minhas-disciplinas/${id}/caderno`, label: 'Meu caderno', on: o.flags.aula },
    { href: '/app/ajuda/criar', label: 'Ajuda Cognuss', on: o.flags.ajuda },
  ].filter((m) => m.on);

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <nav
        aria-label={`Seções de ${d.name}`}
        className="flex flex-wrap gap-2 lg:grid lg:content-start lg:gap-1"
      >
        {menu.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            aria-current={m.current ? 'page' : undefined}
            className={cn(
              'min-h-11 rounded-[var(--radius)] border px-3 py-2 no-underline',
              m.current ? 'border-accent bg-accent text-accent-ink' : 'border-line',
            )}
          >
            {m.label}
          </Link>
        ))}
      </nav>

      <div className="grid min-w-0 gap-6">
        <header className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl md:text-4xl">{d.shortName || d.name}</h1>
            {d.shortName ? (
              <span
                className={cn(
                  'rounded-[4px] border-l-4 px-2 py-0.5 text-sm font-semibold',
                  categoryClasses(d.color as CategoryColor),
                )}
              >
                {d.name}
              </span>
            ) : null}
          </div>
          {d.teachers.length ? (
            <p className="text-sm">Docentes: {d.teachers.map((t) => t.name).join(' · ')}</p>
          ) : null}
          {o.period ? (
            <p className="text-sm text-muted">
              Período: {DAY.format(at(o.period.from))} a {DAY.format(at(o.period.to))}
            </p>
          ) : null}
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {o.flags.lembretes ? (
            <li>
              <Card className="grid h-full gap-1">
                <h2 className="font-semibold">Lembretes</h2>
                <p className="text-3xl font-bold">{o.pendingReminders}</p>
                <p className="text-sm text-muted">pendentes desta disciplina</p>
                <Link href="/app/lembretes" className="text-sm">
                  Ver todos
                </Link>
              </Card>
            </li>
          ) : null}
          <li>
            <Card className="grid h-full gap-1">
              <h2 className="font-semibold">Próxima aula</h2>
              {o.next ? (
                <>
                  <p className="font-semibold">{o.next.title}</p>
                  <p className="text-sm first-letter:uppercase">
                    {LONG.format(at(o.next.date))}
                    {o.next.time ? ` · ${o.next.time}` : ''}
                  </p>
                  {o.next.location || o.next.teacher ? (
                    <p className="text-sm text-muted">
                      {[o.next.location, o.next.teacher].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {o.flags.aula ? (
                    <Link href={`/app/aulas/${o.next.id}`} className="text-sm">
                      Acompanhar a aula
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="text-sm">
                  Sem aulas no cronograma.{' '}
                  <Link href="/app/minhas-disciplinas">Envie o cronograma</Link>.
                </p>
              )}
              {o.flags.agenda ? (
                <Link href={`/app/agenda?visao=lista&disciplina=${id}`} className="text-sm">
                  Ver calendário
                </Link>
              ) : null}
            </Card>
          </li>
          {attendance ? (
            <li>
              <Card className="grid h-full gap-1">
                <h2 className="font-semibold">Faltas na disciplina</h2>
                {attendance.summary ? (
                  <>
                    <p className="text-3xl font-bold">
                      {String(attendance.summary.registered).replace('.', ',')}/
                      {String(attendance.summary.limit).replace('.', ',')}
                    </p>
                    <p className="text-sm text-muted">
                      horas-aula de falta, {attendance.summary.usedPct}% do limite
                    </p>
                  </>
                ) : (
                  <p className="text-sm">Configure a carga horária para ver o limite.</p>
                )}
                <Link href={`/app/faltas/${id}`} className="text-sm">
                  Ver faltas
                </Link>
              </Card>
            </li>
          ) : null}
          {grades ? (
            <li>
              <Card className="grid h-full gap-1">
                <h2 className="font-semibold">Notas</h2>
                {grades.summary.current !== null ? (
                  <>
                    <p className="text-sm text-muted">Média atual</p>
                    <p className="text-3xl font-bold">{formatGrade(grades.summary.current)}</p>
                    <p className="text-sm">
                      {grades.needed.status === 'garantida'
                        ? 'Média mínima garantida'
                        : grades.needed.status === 'sem_restantes'
                          ? `${grades.summary.current >= grades.scheme.minGrade ? 'Acima' : 'Abaixo'} da mínima de ${formatGrade(grades.scheme.minGrade)}`
                          : grades.atRisk
                            ? `Em risco para a mínima de ${formatGrade(grades.scheme.minGrade)}`
                            : `Mínima de ${formatGrade(grades.scheme.minGrade)}`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm">Nenhuma nota lançada.</p>
                )}
                <Link href={`/app/notas/${id}`} className="text-sm">
                  Ver detalhes
                </Link>
              </Card>
            </li>
          ) : null}
        </ul>

        <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
          <Card as="section" aria-labelledby="cal" className="grid min-w-0 content-start gap-3">
            <h2 id="cal" className="text-lg font-semibold">
              Calendário da disciplina
            </h2>
            {o.events.length === 0 ? (
              <p className="text-sm text-muted">Nada nas próximas semanas.</p>
            ) : (
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Próximos eventos da disciplina"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th scope="col" className="p-2">
                        Data
                      </th>
                      <th scope="col" className="p-2">
                        Tipo
                      </th>
                      <th scope="col" className="p-2">
                        Evento
                      </th>
                      <th scope="col" className="p-2">
                        Descrição
                      </th>
                      <th scope="col" className="p-2">
                        Docente
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.events.map((e) => (
                      <tr key={e.id} className="border-t border-line align-top">
                        <td className="p-2 whitespace-nowrap">
                          {DAY.format(at(e.date))}
                          {e.time ? ` ${e.time}` : ''}
                        </td>
                        <td className="p-2">
                          <Badge tone={TYPE[e.type]?.tone ?? 'neutral'}>
                            {TYPE[e.type]?.label ?? e.type}
                          </Badge>
                        </td>
                        <td className="p-2">{e.title}</td>
                        <td className="p-2">{e.description ?? ''}</td>
                        <td className="p-2">{e.teacher ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {o.flags.agenda ? (
              <Link href={`/app/agenda?visao=mes&disciplina=${id}`} className="text-sm">
                Ver calendário completo
              </Link>
            ) : null}
          </Card>

          <div className="grid content-start gap-4">
            <Card as="section" aria-labelledby="crono" className="grid gap-3">
              <h2 id="crono" className="text-lg font-semibold">
                Cronograma da disciplina
              </h2>
              {o.schedule ? (
                <>
                  <p className="text-sm">{o.schedule.name}</p>
                  <DownloadButton fileId={o.schedule.id} label="Baixar o cronograma" />
                </>
              ) : (
                <p className="text-sm">
                  Nenhum cronograma anexado.{' '}
                  <Link href="/app/minhas-disciplinas">Anexar em Minhas disciplinas</Link>.
                </p>
              )}
            </Card>
            <Card as="section" aria-labelledby="resumo" className="grid gap-2">
              <h2 id="resumo" className="text-lg font-semibold">
                Resumo da disciplina
              </h2>
              <dl className="grid gap-1 text-sm">
                {o.summary.totalClassHours !== null ? (
                  <div className="flex justify-between">
                    <dt>Carga horária total</dt>
                    <dd>{String(o.summary.totalClassHours).replace('.', ',')} horas-aula</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt>Aulas no cronograma</dt>
                  <dd>
                    {o.summary.lessons} ({o.summary.pastLessons} já aconteceram)
                  </dd>
                </div>
                {o.flags.aula && o.summary.progress !== null ? (
                  <div className="flex justify-between">
                    <dt>Progresso</dt>
                    <dd>
                      {o.summary.progress}% ({o.summary.concludedLessons} de{' '}
                      {o.summary.occurredLessons} aulas concluídas)
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt>Provas</dt>
                  <dd>{o.summary.exams}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Atividades e entregas</dt>
                  <dd>{o.summary.activities}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
