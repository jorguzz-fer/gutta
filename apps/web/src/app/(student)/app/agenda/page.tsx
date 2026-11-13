import { addDays } from '@gutta/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AgendaRow } from '@/components/agenda/item';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { currentDisciplines } from '@/features/academics/service';
import { getAgendaWeek } from '@/features/agenda/service';
import { requireFeature } from '@/features/flags/service';
import { requireStudent } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Agenda' };

const DAY = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const SHORT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const fmt = (f: Intl.DateTimeFormat, d: string) => f.format(new Date(`${d}T12:00:00Z`));

const GROUPS = [
  { key: 'academico', label: 'Aulas e avaliações' },
  { key: 'estudo', label: 'Estudo' },
  { key: 'pessoal', label: 'Pessoal' },
] as const;
type Group = (typeof GROUPS)[number]['key'];

const groupOf = (kind: string): Group =>
  kind === 'estudo' || kind === 'revisao'
    ? 'estudo'
    : kind === 'pessoal' || kind === 'compromisso'
      ? 'pessoal'
      : 'academico';

const list = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/*
  Agenda geral (SPEC v2, CAL-14): todas as disciplinas e a rotina na mesma semana, lidas do
  serviço único da agenda. Filtros por disciplina e por tipo, sem duplicar nada (CAL-08).
  Acadêmico com borda cheia e pessoal com borda tracejada (CAL-15).
*/
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireFeature('agenda');
  const user = await requireStudent('/app/agenda');
  const sp = await searchParams;
  const semana =
    typeof sp.semana === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? sp.semana : null;
  const filtered = sp.filtro === '1';
  const groups = new Set(filtered ? list(sp.tipo) : GROUPS.map((g) => g.key));
  const discFilter = new Set(list(sp.d));

  const disciplines = await currentDisciplines(user.id);
  const data = await getAgendaWeek(user.id, semana);
  const { start, days } = data;
  const discById = new Map(disciplines.map((d) => [d.id, d]));
  const visible = data.items.filter((i) => {
    if (!groups.has(groupOf(i.kind))) return false;
    if (filtered && i.disciplineId && !discFilter.has(i.disciplineId)) return false;
    return true;
  });
  const keep = new URLSearchParams();
  if (filtered) {
    keep.set('filtro', '1');
    for (const g of groups) keep.append('tipo', g);
    for (const d of discFilter) keep.append('d', d);
  }
  const weekHref = (d: string) => {
    const q = new URLSearchParams(keep);
    q.set('semana', d);
    return `/app/agenda?${q}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="grid gap-1 lg:col-span-2">
        <h1 className="text-3xl md:text-4xl">Agenda</h1>
        <p className="text-muted">Aulas, avaliações, estudo e rotina no mesmo lugar.</p>
      </div>

      <Card as="aside" aria-labelledby="filtros" className="grid content-start gap-4">
        <h2 id="filtros" className="text-lg font-semibold">
          Filtros
        </h2>
        <form method="get" action="/app/agenda" className="grid gap-4">
          <input type="hidden" name="filtro" value="1" />
          <input type="hidden" name="semana" value={start} />
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
            <Link href={`/app/agenda?semana=${start}`} className="text-sm">
              Limpar filtros
            </Link>
          ) : null}
        </form>
      </Card>

      <section aria-labelledby="semana" className="grid content-start gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={weekHref(addDays(start, -7))}
            aria-label="Semana anterior"
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <h2 id="semana" className="text-lg font-semibold">
            Semana de {fmt(SHORT, days[0]!)} a {fmt(SHORT, days[6]!)}
          </h2>
          <Link
            href={weekHref(addDays(start, 7))}
            aria-label="Próxima semana"
            className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
          {!days.includes(data.today) ? (
            <Link
              href={filtered ? `/app/agenda?${keep}` : '/app/agenda'}
              className="ml-auto text-sm"
            >
              Esta semana
            </Link>
          ) : null}
        </div>
        <ol className="grid gap-4">
          {days.map((d) => {
            const dayItems = visible.filter((i) => i.date === d);
            const isToday = d === data.today;
            return (
              <li key={d}>
                <Card as="section" aria-labelledby={`dia-${d}`} className="grid gap-2">
                  <h3 id={`dia-${d}`} className="font-semibold first-letter:uppercase">
                    {fmt(DAY, d)}
                    {isToday ? (
                      <span className="ml-2 text-sm font-normal text-accent">hoje</span>
                    ) : null}
                  </h3>
                  {dayItems.length === 0 ? (
                    <p className="text-sm text-muted">Nada marcado.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {dayItems.map((i) => (
                        <li key={i.id}>
                          <AgendaRow
                            item={i}
                            disciplineName={
                              i.disciplineId ? discById.get(i.disciplineId)?.name : undefined
                            }
                            disciplineColor={
                              i.disciplineId ? discById.get(i.disciplineId)?.color : undefined
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
