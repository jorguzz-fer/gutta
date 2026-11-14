'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { agenda } from '@gutta/contracts';
import { AgendaRow, itemColor, timeLabel } from '@/components/agenda/item';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { categoryClasses } from '@/styles/categories';
import { EventEditor, type EditorTarget } from './event-editor';

type Item = agenda.AgendaItemDto;
type Discipline = { id: string; name: string; shortName: string | null; color: number };
export type View = 'mes' | 'semana' | 'dia' | 'lista';

const LONG = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const fmt = (d: string) => LONG.format(new Date(`${d}T12:00:00Z`));
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/*
  Visões do calendário (SPEC v2, CAL-01): mês, semana, dia e lista, todas lidas da agenda
  única. Clicar num dia vazio ou em "Novo evento" cria; clicar num item edita (CAL-02).
*/
export function CalendarView({
  view,
  days,
  month,
  today,
  items,
  disciplines,
  defaultDiscipline,
  dayHref,
  lessonStudy = false,
  planning = false,
}: {
  view: View;
  /** Dias mostrados, em ordem (no mês, as semanas completas). */
  days: string[];
  /** AAAA-MM do mês mostrado, na visão de mês. */
  month?: string;
  today: string;
  items: Item[];
  disciplines: Discipline[];
  defaultDiscipline?: string;
  /** Link da visão de dia, para o mês. */
  dayHref: Record<string, string>;
  /** Acompanhar Aula ligado: a aula ganha o atalho para a página dela (AUL-01). */
  lessonStudy?: boolean;
  /** Equilíbrio ligado (CAL-10). */
  planning?: boolean;
}) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const discById = new Map(disciplines.map((d) => [d.id, d]));
  const row = (i: Item) => (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => setTarget({ mode: 'edit', item: i })}
      aria-label={`${i.title}, ${timeLabel(i)}. Abrir`}
    >
      <AgendaRow
        item={i}
        disciplineName={i.disciplineId ? discById.get(i.disciplineId)?.name : undefined}
        disciplineColor={i.disciplineId ? discById.get(i.disciplineId)?.color : undefined}
      />
    </button>
  );
  const byDay = (d: string) => items.filter((i) => i.date === d);

  return (
    <div className="grid gap-4">
      <div>
        <Button
          type="button"
          onClick={() => setTarget({ mode: 'new', date: days.includes(today) ? today : days[0]! })}
        >
          <Plus className="size-4" aria-hidden /> Novo evento
        </Button>
      </div>

      {view === 'mes' ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Mês">
          <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
            <caption className="sr-only">Calendário do mês</caption>
            <thead>
              <tr>
                {WEEK.map((w) => (
                  <th key={w} scope="col" className="p-2 text-left font-semibold">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, w) => (
                <tr key={w} className="border-t border-line align-top">
                  {days.slice(w * 7, w * 7 + 7).map((d) => {
                    const list = byDay(d);
                    const outside = month && !d.startsWith(month);
                    return (
                      <td key={d} className="h-24 p-1">
                        <a
                          href={dayHref[d]}
                          className={cn(
                            'inline-grid size-7 place-items-center rounded-full text-xs no-underline',
                            outside && 'text-muted',
                            d === today && 'bg-accent font-bold text-accent-ink',
                          )}
                          aria-label={`${fmt(d)}${list.length ? `, ${list.length} ${list.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                        >
                          {Number(d.slice(8, 10))}
                        </a>
                        <ul className="grid gap-0.5">
                          {list.slice(0, 3).map((i) => (
                            <li key={i.id}>
                              <button
                                type="button"
                                onClick={() => setTarget({ mode: 'edit', item: i })}
                                className={cn(
                                  'w-full truncate rounded-[3px] border-l-2 px-1 text-left text-xs',
                                  categoryClasses(
                                    itemColor(
                                      i,
                                      i.disciplineId
                                        ? discById.get(i.disciplineId)?.color
                                        : undefined,
                                    ),
                                  ),
                                )}
                              >
                                {i.startLocal ? `${i.startLocal} ` : ''}
                                {i.title}
                              </button>
                            </li>
                          ))}
                          {list.length > 3 ? (
                            <li>
                              <a href={dayHref[d]} className="text-xs">
                                +{list.length - 3} mais
                              </a>
                            </li>
                          ) : null}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="grid gap-4">
          {days
            .filter((d) => view !== 'lista' || byDay(d).length > 0)
            .map((d) => {
              const list = byDay(d);
              return (
                <li key={d}>
                  <Card as="section" aria-labelledby={`dia-${d}`} className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 id={`dia-${d}`} className="font-semibold first-letter:uppercase">
                        {fmt(d)}
                        {d === today ? (
                          <span className="ml-2 text-sm font-normal text-accent">hoje</span>
                        ) : null}
                      </h3>
                      <button
                        type="button"
                        className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
                        aria-label={`Novo evento em ${fmt(d)}`}
                        onClick={() => setTarget({ mode: 'new', date: d })}
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted">Nada marcado.</p>
                    ) : (
                      <ul className="grid gap-2">
                        {list.map((i) => (
                          <li key={i.id}>{row(i)}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          {view === 'lista' && items.length === 0 ? (
            <li className="text-muted">Nada marcado nos próximos 30 dias.</li>
          ) : null}
        </ol>
      )}

      {target ? (
        <EventEditor
          key={target.mode === 'new' ? `novo-${target.date}` : target.item.id}
          target={target}
          disciplines={disciplines}
          defaultDiscipline={defaultDiscipline}
          lessonStudy={lessonStudy}
          planning={planning}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}
