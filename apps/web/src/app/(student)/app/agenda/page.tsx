import { addDays, weekStart } from '@gutta/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarView, type View } from '@/components/calendar/calendar-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { currentDisciplines } from '@/features/academics/service';
import { getAgenda, userToday } from '@/features/agenda/service';
import { featureEnabled, requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Agenda' };

const SHORT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);

const VIEWS: { key: View; label: string }[] = [
  { key: 'mes', label: 'Mês' },
  { key: 'semana', label: 'Semana' },
  { key: 'dia', label: 'Dia' },
  { key: 'lista', label: 'Lista' },
];
const GROUPS = [
  { key: 'academico', label: 'Aulas e avaliações' },
  { key: 'estudo', label: 'Estudo' },
  { key: 'pessoal', label: 'Pessoal e compromissos' },
] as const;
type Group = (typeof GROUPS)[number]['key'];
const groupOf = (kind: string): Group =>
  kind === 'estudo' || kind === 'revisao'
    ? 'estudo'
    : kind === 'pessoal' || kind === 'compromisso' || kind === 'outro'
      ? 'pessoal'
      : 'academico';

const list = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function monthStart(d: string) {
  return `${d.slice(0, 7)}-01`;
}
function shiftMonth(d: string, n: number) {
  const x = at(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}

/*
  Agenda e calendário (SPEC v2, CAL-01 a CAL-08, CAL-14 a CAL-16). Uma leitura só, da agenda
  única, em quatro visões. Com uma disciplina escolhida, vira o calendário da disciplina, com
  a chave "Mostrar minha rotina" (CAL-08). Acadêmico com borda cheia, pessoal tracejado.
*/
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireFeature('agenda');
  const user = await requireStudent('/app/agenda');
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.visao) ? (sp.visao as View) : 'semana';
  const today = await userToday(user.id);
  // "semana" continua aceito: os links antigos da agenda usavam esse nome.
  const anchor = isDay(sp.data) ? sp.data : isDay(sp.semana) ? sp.semana : today;
  const disciplines = await currentDisciplines(user.id);
  const scope =
    typeof sp.disciplina === 'string' ? disciplines.find((d) => d.id === sp.disciplina) : undefined;
  const showRoutine = sp.rotina === '1';
  const filtered = sp.filtro === '1';
  const groups = new Set(filtered ? list(sp.tipo) : GROUPS.map((g) => g.key));
  const discFilter = new Set(list(sp.d));

  let days: string[];
  let title: string;
  let prev: string;
  let next: string;
  if (view === 'dia') {
    days = [anchor];
    title = LONG.format(at(anchor));
    prev = addDays(anchor, -1);
    next = addDays(anchor, 1);
  } else if (view === 'mes') {
    const first = weekStart(monthStart(anchor));
    const lastOfMonth = addDays(shiftMonth(anchor, 1), -1);
    const end = addDays(weekStart(lastOfMonth), 6);
    days = [];
    for (let d = first; d <= end; d = addDays(d, 1)) days.push(d);
    title = MONTH.format(at(anchor));
    prev = shiftMonth(anchor, -1);
    next = shiftMonth(anchor, 1);
  } else if (view === 'lista') {
    days = Array.from({ length: 30 }, (_, i) => addDays(anchor, i));
    title = `De ${SHORT.format(at(days[0]!))} a ${SHORT.format(at(days[29]!))}`;
    prev = addDays(anchor, -30);
    next = addDays(anchor, 30);
  } else {
    const start = weekStart(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    title = `Semana de ${SHORT.format(at(days[0]!))} a ${SHORT.format(at(days[6]!))}`;
    prev = addDays(start, -7);
    next = addDays(start, 7);
  }

  const data = await getAgenda(user.id, { from: days[0]!, to: days.at(-1)! });
  const items = data.items.filter((i) => {
    if (scope) {
      // Calendário da disciplina: os eventos dela, e a rotina só com a chave ligada (CAL-08).
      if (i.disciplineId === scope.id) return true;
      return showRoutine && !i.disciplineId;
    }
    if (!groups.has(groupOf(i.kind))) return false;
    if (filtered && i.disciplineId && !discFilter.has(i.disciplineId)) return false;
    return true;
  });

  const keep = new URLSearchParams();
  keep.set('visao', view);
  keep.set('data', anchor);
  if (scope) {
    keep.set('disciplina', scope.id);
    if (showRoutine) keep.set('rotina', '1');
  }
  if (filtered) {
    keep.set('filtro', '1');
    for (const g of groups) keep.append('tipo', g);
    for (const d of discFilter) keep.append('d', d);
  }
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/app/agenda?${q}`;
  };
  const dayHref = Object.fromEntries(days.map((d) => [d, href({ visao: 'dia', data: d })]));

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="grid gap-1 lg:col-span-2">
        <h1 className="text-3xl md:text-4xl">{scope ? `Calendário de ${scope.name}` : 'Agenda'}</h1>
        <p className="text-muted">
          {scope
            ? 'Aulas, avaliações e compromissos da disciplina.'
            : 'Aulas, avaliações, estudo e rotina no mesmo lugar.'}
        </p>
      </div>

      <Card as="aside" aria-labelledby="filtros" className="grid content-start gap-4">
        <h2 id="filtros" className="text-lg font-semibold">
          {scope ? 'Disciplina' : 'Filtros'}
        </h2>
        {scope ? (
          <div className="grid gap-3">
            <Link
              href={href({ rotina: showRoutine ? null : '1' })}
              role="switch"
              aria-checked={showRoutine}
              className="flex min-h-11 items-center gap-2 no-underline"
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block h-6 w-10 rounded-full border border-line-strong p-0.5',
                  showRoutine && 'bg-accent',
                )}
              >
                <span
                  className={cn(
                    'block size-4 rounded-full bg-fg transition-transform',
                    showRoutine && 'translate-x-4',
                  )}
                />
              </span>
              Mostrar minha rotina
            </Link>
            <Link href={`/app/agenda?visao=${view}&data=${anchor}`}>Ver agenda geral</Link>
          </div>
        ) : (
          <form method="get" action="/app/agenda" className="grid gap-4">
            <input type="hidden" name="filtro" value="1" />
            <input type="hidden" name="visao" value={view} />
            <input type="hidden" name="data" value={anchor} />
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium">Tipos</legend>
              {GROUPS.map((g) => (
                <label key={g.key} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name="tipo"
                    value={g.key}
                    defaultChecked={groups.has(g.key)}
                    className="size-5"
                  />
                  {g.label}
                </label>
              ))}
            </fieldset>
            {disciplines.length ? (
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">Disciplinas</legend>
                {disciplines.map((d) => (
                  <label key={d.id} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name="d"
                      value={d.id}
                      defaultChecked={!filtered || discFilter.has(d.id)}
                      className="size-5"
                    />
                    {d.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <Button type="submit" variant="secondary">
              Aplicar filtros
            </Button>
            {filtered ? (
              <Link href={`/app/agenda?visao=${view}&data=${anchor}`} className="text-sm">
                Limpar filtros
              </Link>
            ) : null}
          </form>
        )}
        {!scope && disciplines.length ? (
          <nav aria-label="Calendário por disciplina" className="grid gap-1 text-sm">
            <p className="font-medium">Calendário da disciplina</p>
            {disciplines.map((d) => (
              <Link key={d.id} href={`/app/agenda?visao=${view}&data=${anchor}&disciplina=${d.id}`}>
                {d.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </Card>

      <section aria-labelledby="periodo" className="grid min-w-0 content-start gap-4">
        <nav aria-label="Visões" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href({ visao: v.key, data: anchor })}
              aria-current={v.key === view ? 'page' : undefined}
              className={cn(
                'min-h-11 rounded-[var(--radius)] border px-4 py-2 no-underline',
                v.key === view ? 'border-accent bg-accent text-accent-ink' : 'border-line',
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={href({ data: prev })}
            aria-label="Período anterior"
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <h2 id="periodo" className="text-lg font-semibold first-letter:uppercase">
            {title}
          </h2>
          <Link
            href={href({ data: next })}
            aria-label="Próximo período"
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
          {!days.includes(today) ? (
            <Link href={href({ data: null })} className="ml-auto text-sm">
              Hoje
            </Link>
          ) : null}
        </div>
        <CalendarView
          view={view}
          days={days}
          month={view === 'mes' ? anchor.slice(0, 7) : undefined}
          today={today}
          items={items}
          disciplines={disciplines}
          defaultDiscipline={scope?.id}
          dayHref={dayHref}
          lessonStudy={await featureEnabled('aula')}
        />
      </section>
    </div>
  );
}
