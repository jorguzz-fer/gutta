import { BookOpen, CalendarDays, CalendarRange, CheckCircle2, Clock, Target } from 'lucide-react';
import Link from 'next/link';
import { AgendaRow, KIND_LABEL, timeLabel } from '@/components/agenda/item';
import { buttonClass } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import type { Space } from '@/features/space/service';
import { cn } from '@/lib/cn';
import { TodayTasks } from './today-tasks';
import { categoryClasses, type CategoryColor } from '@/styles/categories';

const hours = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
};
const DAY = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const SHORT = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const fmt = (f: Intl.DateTimeFormat, d: string) => f.format(new Date(`${d}T12:00:00Z`));

const IMPORT_LABEL: Record<string, string> = {
  waiting_file: 'Cronograma em leitura',
  extracting: 'Cronograma em leitura',
  needs_consent: 'Cronograma aguardando sua autorização',
  ready: 'Cronograma pronto para conferir',
  confirmed: 'Cronograma conferido',
  failed: 'Cronograma não lido',
};

export type SpaceLinks = {
  rotina: boolean;
  agenda: boolean;
  disciplinas: boolean;
  lembretes: boolean;
  faltas: boolean;
  notas: boolean;
  materiais: boolean;
  /** Acompanhar Aula ligado: o progresso (aulas concluídas) passa a ter sentido. */
  aula: boolean;
  equilibrio: boolean;
};

/** Resumo da semana do Equilíbrio (EQU-10, EQU-16), quando ligado. */
export type SpacePlanning = {
  balance: { state: 'equilibrada' | 'intensa' | 'revisar'; message: string };
  indicators: { availableMinutes: number; plannedMinutes: number; doneMinutes: number };
  next: { id: string; title: string; date: string; startLocal: string; endLocal: string }[];
  behind: number;
  pendingTasks: number;
} | null;

/** Barra de progresso (6.4, D13): aulas concluídas no Acompanhar Aula sobre as ocorridas. */
function Progress({ value, label, detail }: { value: number; label: string; detail: string }) {
  return (
    <div className="grid gap-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}%, ${detail}`}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full bg-accent" style={{ width: `${value}%` }} />
      </div>
      <p>
        {value}% · {detail}
      </p>
    </div>
  );
}

/*
  Meu Espaço, versão inicial (SPEC v2, 5.5; tela T10). A ordem segue a tela: cabeçalho com
  objetivo, visão do dia, disciplinas, rotina, plano da semana e próximos compromissos.
  Números só quando existem; cada cartão vazio diz o que falta e leva ao passo certo.
*/
export function MySpace({
  space,
  links,
  planning = null,
}: {
  space: Space;
  links: SpaceLinks;
  planning?: SpacePlanning;
}) {
  const p = space.profile;
  const subtitle = [
    p.course ? `Estudante de ${p.course}` : null,
    p.semester ? `${p.semester}º semestre` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const place = [
    p.institution,
    p.campus ? `Campus ${p.campus}` : null,
    p.classGroup ? `Turma ${p.classGroup}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const discById = new Map(space.disciplines.map((d) => [d.id, d]));
  const r = space.routine;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl md:text-4xl">
            Olá{space.greetingName ? `, ${space.greetingName}` : ''}!
          </h1>
          {subtitle ? <p className="font-medium">{subtitle}</p> : null}
          {place ? <p className="text-sm text-muted">{place}</p> : null}
        </div>
        <Card as="div" className="flex items-center gap-4 p-4">
          <Target className="size-6 text-accent" aria-hidden />
          <div>
            <p className="text-sm text-muted">Seu objetivo principal</p>
            <p className="font-semibold">{p.mainGoalLabel ?? 'Ainda não escolhido'}</p>
          </div>
          <Link href="/app/objetivo" className={buttonClass('secondary', 'md')}>
            Alterar objetivo
          </Link>
        </Card>
      </header>

      <nav aria-label="Seções do Meu Espaço" className="flex flex-wrap gap-2">
        <span aria-current="page" className={buttonClass('primary', 'md')}>
          Visão geral
        </span>
        {links.rotina ? (
          <Link href="/app/rotina" className={buttonClass('secondary', 'md')}>
            Rotina semanal
          </Link>
        ) : null}
        {links.equilibrio ? (
          <Link href="/app/equilibrio" className={buttonClass('secondary', 'md')}>
            Equilíbrio
          </Link>
        ) : null}
        {links.agenda ? (
          <Link href="/app/agenda" className={buttonClass('secondary', 'md')}>
            Agenda
          </Link>
        ) : null}
        {links.disciplinas ? (
          <Link href="/app/minhas-disciplinas" className={buttonClass('secondary', 'md')}>
            Minhas disciplinas
          </Link>
        ) : null}
        {links.lembretes ? (
          <Link href="/app/lembretes" className={buttonClass('secondary', 'md')}>
            Lembretes
          </Link>
        ) : null}
        {links.faltas ? (
          <Link href="/app/faltas" className={buttonClass('secondary', 'md')}>
            Faltas
          </Link>
        ) : null}
        {links.notas ? (
          <Link href="/app/notas" className={buttonClass('secondary', 'md')}>
            Notas
          </Link>
        ) : null}
        {links.materiais ? (
          <Link href="/app/materiais" className={buttonClass('secondary', 'md')}>
            Material de estudo
          </Link>
        ) : null}
      </nav>

      {planning ? (
        <Alert tone={planning.balance.state === 'equilibrada' ? 'success' : 'warn'} role="status">
          <p className="font-semibold">
            Minha semana está equilibrada?{' '}
            {planning.balance.state === 'equilibrada'
              ? 'Sim'
              : planning.balance.state === 'intensa'
                ? 'Semana intensa'
                : 'Planejamento a revisar'}
          </p>
          <p>{planning.balance.message}</p>
          {planning.balance.state !== 'equilibrada' ? (
            <Link href="/app/equilibrio" className="text-sm">
              Abrir o Equilíbrio
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card aria-labelledby="dia" className="grid content-start gap-3">
          <h2 id="dia" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="size-5" aria-hidden /> Visão do dia
          </h2>
          <p className="text-sm text-muted first-letter:uppercase">Hoje, {fmt(DAY, space.today)}</p>
          {space.todayItems.length === 0 ? (
            <p className="text-sm">
              Nada marcado para hoje.{' '}
              {links.rotina ? <Link href="/app/rotina">Monte sua rotina</Link> : null}
            </p>
          ) : (
            <ul className="grid gap-2">
              {space.todayItems.map((i) => (
                <li key={i.id}>
                  <AgendaRow
                    item={i}
                    disciplineName={i.disciplineId ? discById.get(i.disciplineId)?.name : undefined}
                    disciplineColor={
                      i.disciplineId ? discById.get(i.disciplineId)?.color : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="disciplinas" className="grid content-start gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="disciplinas" className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="size-5" aria-hidden /> Minhas disciplinas (
              {space.disciplines.length})
            </h2>
            {links.aula && space.overallProgress !== null ? (
              <p className="text-sm">
                Progresso geral: <strong>{space.overallProgress}%</strong>
              </p>
            ) : null}
            {links.disciplinas ? (
              <Link href="/app/minhas-disciplinas" className="text-sm">
                Gerenciar ou adicionar disciplinas
              </Link>
            ) : null}
          </div>
          {space.disciplines.length === 0 ? (
            <p className="text-sm">
              Você ainda não cadastrou disciplinas.{' '}
              {links.disciplinas ? (
                <Link href="/app/minhas-disciplinas">Adicionar a primeira</Link>
              ) : null}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {space.disciplines.map((d) => {
                const hasSchedule = d.documents.some((x) => x.kind === 'cronograma');
                return (
                  <li
                    key={d.id}
                    className={cn(
                      'grid gap-1 rounded-[var(--radius)] border-l-4 p-3 text-sm',
                      categoryClasses(d.color as CategoryColor),
                    )}
                  >
                    <p className="text-base font-semibold">
                      {links.disciplinas ? (
                        <Link href={`/app/minhas-disciplinas/${d.id}`}>
                          {d.shortName || d.name}
                        </Link>
                      ) : (
                        d.shortName || d.name
                      )}
                    </p>
                    {d.shortName ? <p>{d.name}</p> : null}
                    {d.teachers.length ? <p>{d.teachers.map((t) => t.name).join(', ')}</p> : null}
                    <p>
                      {d.scheduleImport
                        ? (IMPORT_LABEL[d.scheduleImport.status] ?? 'Cronograma anexado')
                        : hasSchedule
                          ? 'Cronograma anexado'
                          : 'Sem cronograma'}
                    </p>
                    <p>
                      {d.lessons.total
                        ? `${d.lessons.past} de ${d.lessons.total} aulas do cronograma já aconteceram`
                        : 'Sem aulas no cronograma ainda'}
                    </p>
                    {links.aula && d.progress !== null ? (
                      <Progress
                        value={d.progress}
                        label={`Progresso em ${d.shortName || d.name}`}
                        detail={`${d.lessons.concluded} de ${d.lessons.past} aulas concluídas`}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="rotina" className="grid content-start gap-3">
          <h2 id="rotina" className="flex items-center gap-2 text-lg font-semibold">
            <Clock className="size-5" aria-hidden /> Minha rotina semanal
          </h2>
          {r.hasBlocks || r.summary.classMinutes ? (
            <>
              <p className="text-sm">
                Estudo extraclasse: <strong>{hours(r.goal.plannedMinutes)} planejadas</strong> de
                uma meta de {hours(r.goal.goalMinutes)}
              </p>
              <div
                role="progressbar"
                aria-label="Estudo planejado em relação à meta"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={r.goal.percent}
                className="h-2 overflow-hidden rounded-full bg-surface-2"
              >
                <div className="h-full bg-accent" style={{ width: `${r.goal.percent}%` }} />
              </div>
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <dt>Aulas na semana</dt>
                  <dd>{hours(r.summary.classMinutes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Outras atividades</dt>
                  <dd>{hours(r.summary.otherMinutes)}</dd>
                </div>
                {r.sleepDailyMinutes !== null ? (
                  <div className="flex justify-between">
                    <dt>Descanso registrado (média diária)</dt>
                    <dd>{hours(r.sleepDailyMinutes)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt>Meta de estudo</dt>
                  <dd>{hours(r.goal.goalMinutes)}/sem</dd>
                </div>
              </dl>
              <p className="text-sm text-muted">{r.goal.message}</p>
            </>
          ) : (
            <p className="text-sm">
              Sua rotina ainda está vazia. Marque quando você estuda e o que é só seu.
            </p>
          )}
          {links.rotina ? (
            <Link href="/app/rotina" className={buttonClass('secondary', 'md')}>
              Ver e editar rotina
            </Link>
          ) : null}
        </Card>

        <Card aria-labelledby="plano" className="grid content-start gap-3">
          <h2 id="plano" className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5" aria-hidden /> Plano de estudos da semana
          </h2>
          {planning ? (
            <>
              <p className="text-sm">
                {hours(planning.indicators.plannedMinutes)} planejadas e{' '}
                {hours(planning.indicators.doneMinutes)} feitas, de{' '}
                {hours(planning.indicators.availableMinutes)} disponíveis nos seus horários de
                estudo.
              </p>
              {planning.next.length ? (
                <ul className="grid gap-1 text-sm" aria-label="Próximas sessões de estudo">
                  {planning.next.map((x) => (
                    <li key={x.id} className="flex justify-between gap-2">
                      <span>{x.title}</span>
                      <span className="shrink-0 text-muted">
                        {fmt(SHORT, x.date)} · {x.startLocal}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nenhuma sessão confirmada por vir.</p>
              )}
              {planning.behind ? (
                <p className="text-sm">
                  {planning.behind === 1
                    ? '1 sessão ficou para trás e espera a sua decisão.'
                    : `${planning.behind} sessões ficaram para trás e esperam a sua decisão.`}
                </p>
              ) : null}
              <Link href="/app/equilibrio" className={buttonClass('secondary', 'md')}>
                {planning.pendingTasks ? 'Planejar a semana' : 'Abrir o Equilíbrio'}
              </Link>
            </>
          ) : (
            <p className="text-sm">
              O plano de estudos distribui os conteúdos nos seus horários de estudo. Ele aparece
              aqui quando você criar o primeiro.
            </p>
          )}
          {!r.hasBlocks && links.rotina ? (
            <p className="text-sm">
              Antes,{' '}
              <Link href="/app/rotina">marque na rotina os horários em que quer estudar</Link>.
            </p>
          ) : null}
          {space.tasks.length ? (
            <TodayTasks tasks={space.tasks} />
          ) : (
            <>
              <h3 className="text-base font-semibold">Tarefas de hoje</h3>
              <p className="text-sm text-muted">
                Nenhuma tarefa para hoje.{' '}
                {links.lembretes ? <Link href="/app/lembretes">Criar um lembrete</Link> : null}
              </p>
            </>
          )}
        </Card>

        <Card aria-labelledby="proximos" className="grid content-start gap-3">
          <h2 id="proximos" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarRange className="size-5" aria-hidden /> Próximos compromissos
          </h2>
          {space.upcoming.length === 0 ? (
            <p className="text-sm">Nenhuma prova, entrega ou prática nos próximos 14 dias.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {space.upcoming.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>
                    <strong>{KIND_LABEL[i.kind]}</strong> · {i.title}
                    {i.disciplineId && discById.get(i.disciplineId)
                      ? ` (${discById.get(i.disciplineId)!.shortName || discById.get(i.disciplineId)!.name})`
                      : ''}
                  </span>
                  <span className="shrink-0 text-muted">
                    {fmt(SHORT, i.date)}
                    {i.allDay ? '' : ` · ${timeLabel(i)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {links.agenda ? (
            <Link href="/app/agenda" className="text-sm">
              Ver agenda completa
            </Link>
          ) : null}
        </Card>
      </div>
      {space.disciplines.some((d) => d.scheduleImport?.status === 'ready') ? (
        <Alert>
          Há cronograma lido esperando a sua conferência em{' '}
          <Link href="/app/minhas-disciplinas">Minhas disciplinas</Link>.
        </Alert>
      ) : null}
    </div>
  );
}
