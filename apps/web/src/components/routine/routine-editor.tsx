'use client';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { routine } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import {
  CATEGORY_COLORS,
  categoryClasses,
  EVENT_TYPE_COLOR,
  type CategoryColor,
} from '@/styles/categories';

type Dto = routine.RoutineDto;
type Block = routine.RoutineBlockDto;
type Lesson = Dto['lessons'][number];
type Kind = Block['kind'];

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const PERSONAL = [
  ['sono', 'Sono'],
  ['refeicao', 'Refeição'],
  ['lazer', 'Lazer'],
  ['academia', 'Academia'],
  ['esporte', 'Esporte'],
  ['idiomas', 'Idiomas'],
  ['trabalho', 'Trabalho'],
  ['descanso', 'Descanso'],
  ['bloqueado', 'Horário bloqueado (sem dizer o motivo)'],
  ['personalizada', 'Outra atividade'],
] as const;

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (m: number) => {
  const v = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const hours = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
};
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** O bloco ocupa o horário [slot, slot+step) do dia da semana (considera a virada da noite). */
function blockCovers(b: Block, weekday: number, slot: number, step: number) {
  const start = toMin(b.start);
  const end = start + b.durationMinutes;
  const hit = (s: number, e: number) => s < slot + step && slot < e;
  if (b.weekdays.includes(weekday) && hit(start, Math.min(end, 1440))) return true;
  const prev = (weekday + 6) % 7;
  return end > 1440 && b.weekdays.includes(prev) && hit(0, end - 1440);
}

function lessonCovers(l: Lesson, date: string, slot: number, step: number) {
  if (l.date !== date || l.allDay) return false;
  const s = toMin(l.start);
  const e = l.end ? toMin(l.end) || 1440 : s + 60;
  return s < slot + step && slot < e;
}

type Draft = {
  id?: string;
  kind: Kind;
  category: string;
  label: string;
  disciplineId: string;
  color: CategoryColor;
  weekdays: number[];
  start: string;
  end: string;
  /** Dia clicado, para "tirar só deste dia". */
  weekday?: number;
};

/*
  Rotina semanal (SPEC v2, ROT-01 a ROT-12). Grade de domingo a sábado com as aulas do
  cronograma da semana (protegidas, ROT-05) e os blocos que se repetem. Clicar numa célula
  vazia adiciona; clicar num bloco edita. A meta mede o estudo escolhido, nunca a ocupação da
  semana (lacuna L2).
*/
export function RoutineEditor({ initial }: { initial: Dto }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lessonDialog = useRef<HTMLDialogElement>(null);
  const prefs = data.preferences;
  const step = prefs.gridStepMinutes;

  useEffect(() => {
    if (draft) dialog.current?.showModal?.();
    else dialog.current?.close?.();
  }, [draft]);
  useEffect(() => {
    if (lesson) lessonDialog.current?.showModal?.();
    else lessonDialog.current?.close?.();
  }, [lesson]);

  const discById = new Map(data.disciplines.map((d) => [d.id, d]));
  const colorOf = (b: Block): CategoryColor => {
    if (b.kind === 'aula') return (discById.get(b.disciplineId ?? '')?.color ?? 6) as CategoryColor;
    if (b.kind === 'estudo') return EVENT_TYPE_COLOR.estudo;
    if (b.color) return b.color as CategoryColor;
    return b.category === 'lazer' ? EVENT_TYPE_COLOR.lazer : EVENT_TYPE_COLOR.pessoal;
  };

  async function reload(week = data.week.start) {
    const res = await api<{ routine: Dto }>(`/routine?week=${week}`);
    setData(res.routine);
  }

  async function savePrefs(patch: Partial<Dto['preferences']>) {
    const next = { ...prefs, ...patch };
    setData((d) => ({ ...d, preferences: next }));
    try {
      await api('/routine/preferences', { method: 'PUT', body: next });
      await reload();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    }
  }

  const openNew = (weekday: number, slot: number) => {
    setError('');
    setDraft({
      kind: 'estudo',
      category: 'academia',
      label: '',
      disciplineId: data.disciplines[0]?.id ?? '',
      color: 7,
      weekdays: [weekday],
      start: toHm(slot),
      end: toHm(slot + Math.max(step, 60)),
      weekday,
    });
  };
  const openEdit = (b: Block, weekday: number) => {
    setError('');
    setDraft({
      id: b.id,
      kind: b.kind,
      category: b.category ?? 'academia',
      label: b.kind === 'pessoal' && b.category === 'personalizada' ? b.label : '',
      disciplineId: b.disciplineId ?? data.disciplines[0]?.id ?? '',
      color: (b.color ?? 7) as CategoryColor,
      weekdays: b.weekdays,
      start: b.start,
      end: b.end,
      weekday,
    });
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const body = {
      kind: draft.kind,
      category: draft.kind === 'pessoal' ? draft.category : null,
      label: draft.kind === 'pessoal' && draft.category === 'personalizada' ? draft.label : null,
      disciplineId: draft.kind === 'aula' ? draft.disciplineId : null,
      color: draft.kind === 'pessoal' && draft.category === 'personalizada' ? draft.color : null,
      weekdays: draft.weekdays,
      start: draft.start,
      end: draft.end,
    };
    try {
      if (draft.id) await api(`/routine/blocks/${draft.id}`, { method: 'PUT', body });
      else await api('/routine/blocks', { method: 'POST', body });
      setDraft(null);
      await reload();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(onlyDay: boolean) {
    if (!draft?.id) return;
    setBusy(true);
    try {
      const q = onlyDay && draft.weekday !== undefined ? `?weekday=${draft.weekday}` : '';
      await api(`/routine/blocks/${draft.id}${q}`, { method: 'DELETE' });
      setDraft(null);
      await reload();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para tirar agora.');
    } finally {
      setBusy(false);
    }
  }

  const slots: number[] = [];
  for (let m = prefs.viewStartMinute; m < prefs.viewEndMinute; m += step) slots.push(m);
  const goal = data.goal;
  const allDayLessons = data.lessons.filter((l) => l.allDay);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="grid min-w-0 content-start gap-4">
        <Card className="grid gap-3" aria-labelledby="meta">
          <h2 id="meta" className="sr-only">
            Meta de estudo da semana
          </h2>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-sm text-muted">Meta semanal</dt>
              <dd className="text-2xl font-bold">{hours(goal.goalMinutes)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Estudo planejado</dt>
              <dd className="text-2xl font-bold">{hours(goal.plannedMinutes)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">
                {goal.extraMinutes ? 'Acima da meta' : 'Faltam'}
              </dt>
              <dd className="text-2xl font-bold">
                {hours(goal.extraMinutes || goal.missingMinutes)}
              </dd>
            </div>
          </dl>
          <div
            role="progressbar"
            aria-label="Estudo planejado em relação à meta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goal.percent}
            className="h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent" style={{ width: `${goal.percent}%` }} />
          </div>
          <p aria-live="polite">{goal.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium" id="meta-label">
              Meta de estudo extraclasse
            </span>
            <Button
              type="button"
              variant="secondary"
              aria-label="Diminuir a meta em 1 hora"
              disabled={prefs.weeklyGoalMinutes <= 0}
              onClick={() =>
                savePrefs({ weeklyGoalMinutes: Math.max(0, prefs.weeklyGoalMinutes - 60) })
              }
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <output aria-labelledby="meta-label" className="min-w-20 text-center font-semibold">
              {hours(prefs.weeklyGoalMinutes)}
            </output>
            <Button
              type="button"
              variant="secondary"
              aria-label="Aumentar a meta em 1 hora"
              disabled={prefs.weeklyGoalMinutes >= 6000}
              onClick={() =>
                savePrefs({ weeklyGoalMinutes: Math.min(6000, prefs.weeklyGoalMinutes + 60) })
              }
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
        </Card>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              aria-label="Semana anterior"
              onClick={() => reload(shiftWeek(data.week.start, -7))}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Button>
            <p className="font-semibold" aria-live="polite">
              Semana de {dayLabel(data.week.days[0]!)} a {dayLabel(data.week.days[6]!)}
            </p>
            <Button
              type="button"
              variant="ghost"
              aria-label="Próxima semana"
              onClick={() => reload(shiftWeek(data.week.start, 7))}
            >
              <ChevronRight className="size-5" aria-hidden />
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-sm">
              Intervalo
              <select
                className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
                value={step}
                onChange={(e) =>
                  savePrefs({ gridStepMinutes: Number(e.target.value) as 15 | 30 | 60 })
                }
              >
                <option value={60}>1 hora</option>
                <option value={30}>30 minutos</option>
                <option value={15}>15 minutos</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Mostrar de
              <select
                className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
                value={prefs.viewStartMinute}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  savePrefs({
                    viewStartMinute: v,
                    viewEndMinute: Math.max(prefs.viewEndMinute, v + 60),
                  });
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h * 60}>
                    {toHm(h * 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              até
              <select
                className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
                value={prefs.viewEndMinute}
                onChange={(e) => savePrefs({ viewEndMinute: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (h + 1) * 60)
                  .filter((m) => m > prefs.viewStartMinute)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m === 1440 ? '24:00' : toHm(m)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>

        {allDayLessons.length ? (
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Eventos de dia inteiro">
            {allDayLessons.map((l) => (
              <li key={l.id} className="rounded-[var(--radius)] border border-line px-2 py-1">
                {DAYS[new Date(`${l.date}T12:00:00Z`).getUTCDay()]} {dayLabel(l.date)}: {l.title}
              </li>
            ))}
          </ul>
        ) : null}

        <div
          className="overflow-x-auto rounded-[var(--radius)] border border-line"
          tabIndex={0}
          role="region"
          aria-label="Grade da semana"
        >
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">
              Rotina da semana. Toque numa célula vazia para adicionar uma atividade.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-16 p-2 text-left font-medium text-muted">
                  Hora
                </th>
                {data.week.days.map((d, i) => (
                  <th key={d} scope="col" className="p-2 font-semibold">
                    {DAYS[i]} <span className="font-normal text-muted">{dayLabel(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot} className="border-t border-line">
                  <th scope="row" className="p-2 text-left font-normal text-muted">
                    {toHm(slot)}
                  </th>
                  {data.week.days.map((date, weekday) => {
                    const l = data.lessons.find((x) => lessonCovers(x, date, slot, step));
                    const b = l
                      ? undefined
                      : data.blocks.find((x) => blockCovers(x, weekday, slot, step));
                    const where = `${DAY_NAMES[weekday]}, ${toHm(slot)}`;
                    if (l) {
                      const disc = discById.get(l.disciplineId);
                      return (
                        <td key={date} className="p-0.5">
                          <button
                            type="button"
                            onClick={() => setLesson(l)}
                            aria-label={`${l.title}, aula do cronograma, ${where}`}
                            className={cn(
                              'grid min-h-11 w-full place-items-center rounded-[4px] border-l-4 px-1 text-xs font-semibold',
                              categoryClasses((disc?.color ?? 6) as CategoryColor),
                            )}
                          >
                            <span className="line-clamp-2">
                              {disc?.shortName || disc?.name || l.title}
                            </span>
                          </button>
                        </td>
                      );
                    }
                    if (b) {
                      return (
                        <td key={date} className="p-0.5">
                          <button
                            type="button"
                            onClick={() => openEdit(b, weekday)}
                            aria-label={`${b.label}, ${b.start} às ${b.end}, ${where}. Editar`}
                            className={cn(
                              'grid min-h-11 w-full place-items-center rounded-[4px] border-l-4 px-1 text-xs font-semibold',
                              categoryClasses(colorOf(b)),
                            )}
                          >
                            <span className="line-clamp-2">{b.label}</span>
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={date} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => openNew(weekday, slot)}
                          aria-label={`Adicionar em ${where}`}
                          className="grid min-h-11 w-full place-items-center rounded-[4px] text-muted/70 hover:bg-surface-2"
                        >
                          <span aria-hidden>+</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Aulas do cronograma ficam protegidas: o planejamento nunca usa esses horários, nem os de
          atividades pessoais. Só os blocos de estudo contam como horário para estudar.
        </p>
      </div>

      <aside className="grid content-start gap-4">
        <Card aria-labelledby="resumo" className="grid gap-2">
          <h2 id="resumo" className="text-lg font-semibold">
            Resumo da sua rotina
          </h2>
          <dl className="grid gap-1 text-sm">
            <Row label="Aulas" value={data.summary.classMinutes} />
            <Row label="Estudo extraclasse" value={data.summary.studyMinutes} />
            <Row label="Outras atividades" value={data.summary.otherMinutes} />
            <Row label="Total da rotina" value={data.summary.totalMinutes} strong />
          </dl>
        </Card>
        <Card aria-labelledby="atividades" className="grid gap-2">
          <h2 id="atividades" className="text-lg font-semibold">
            Atividades que se repetem
          </h2>
          {data.blocks.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma ainda. Toque numa célula vazia da grade.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {data.blocks.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius)] border border-line p-2 text-left hover:border-line-strong"
                    onClick={() => openEdit(b, b.weekdays[0]!)}
                  >
                    <span className="font-semibold">{b.label}</span>
                    <span className="block text-muted">
                      {b.weekdays.map((w) => DAYS[w]).join(', ')} · {b.start} às {b.end}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>

      <dialog
        ref={dialog}
        aria-labelledby="dlg-titulo"
        onClose={() => setDraft(null)}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
      >
        {draft ? (
          <form onSubmit={submit} className="grid gap-4 p-5">
            <h2 id="dlg-titulo" className="text-xl font-semibold">
              {draft.id ? 'Editar atividade' : 'Adicionar atividade'}
            </h2>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">O que é</legend>
              {(
                [
                  ['estudo', 'Estudo'],
                  ['aula', 'Aula de uma disciplina'],
                  ['pessoal', 'Atividade pessoal'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="kind"
                    className="size-5"
                    checked={draft.kind === k}
                    onChange={() => setDraft({ ...draft, kind: k })}
                  />
                  {l}
                </label>
              ))}
            </fieldset>
            {draft.kind === 'aula' ? (
              data.disciplines.length ? (
                <Field label="Disciplina">
                  {(p) => (
                    <Select
                      {...p}
                      value={draft.disciplineId}
                      onChange={(e) => setDraft({ ...draft, disciplineId: e.target.value })}
                    >
                      {data.disciplines.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <Alert>Cadastre suas disciplinas primeiro, em Minhas disciplinas.</Alert>
              )
            ) : null}
            {draft.kind === 'pessoal' ? (
              <>
                <Field label="Atividade">
                  {(p) => (
                    <Select
                      {...p}
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    >
                      {PERSONAL.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {draft.category === 'personalizada' ? (
                  <>
                    <Field label="Nome da atividade">
                      {(p) => (
                        <Input
                          {...p}
                          value={draft.label}
                          maxLength={60}
                          required
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        />
                      )}
                    </Field>
                    <fieldset className="grid gap-2">
                      <legend className="mb-1 text-sm font-medium">Cor</legend>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORY_COLORS.map((c) => (
                          <label
                            key={c.id}
                            className={cn(
                              'flex min-h-11 items-center gap-2 rounded-[var(--radius)] border-l-4 px-3',
                              categoryClasses(c.id),
                            )}
                          >
                            <input
                              type="radio"
                              name="color"
                              checked={draft.color === c.id}
                              onChange={() => setDraft({ ...draft, color: c.id })}
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </>
                ) : null}
              </>
            ) : null}
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Repete em</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label
                    key={d}
                    className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] border border-line px-3"
                  >
                    <input
                      type="checkbox"
                      checked={draft.weekdays.includes(i)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          weekdays: e.target.checked
                            ? [...draft.weekdays, i].sort()
                            : draft.weekdays.filter((w) => w !== i),
                        })
                      }
                    />
                    <span aria-hidden>{d}</span>
                    <span className="sr-only">{DAY_NAMES[i]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    required
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Fim" hint="Antes do início: termina no dia seguinte.">
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    required
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                )}
              </Field>
            </div>
            {error ? (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  draft.weekdays.length === 0 ||
                  (draft.kind === 'aula' && !data.disciplines.length)
                }
              >
                Salvar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
            {draft.id ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {draft.weekdays.length > 1 && draft.weekday !== undefined ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => remove(true)}
                  >
                    Tirar só de {DAY_NAMES[draft.weekday]}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => remove(false)}
                >
                  Tirar de todos os dias
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </dialog>

      <dialog
        ref={lessonDialog}
        aria-labelledby="aula-titulo"
        onClose={() => setLesson(null)}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-5 text-fg backdrop:bg-black/50"
      >
        {lesson ? (
          <div className="grid gap-3">
            <h2 id="aula-titulo" className="text-xl font-semibold">
              {lesson.title}
            </h2>
            <p>
              {discById.get(lesson.disciplineId)?.name} · {dayLabel(lesson.date)}, {lesson.start}
              {lesson.end ? ` às ${lesson.end}` : ''}
            </p>
            <p className="text-sm text-muted">
              Aula do cronograma. Ela fica protegida na rotina; para mudar, envie o cronograma
              atualizado em Minhas disciplinas.
            </p>
            <div>
              <Button type="button" onClick={() => setLesson(null)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex justify-between gap-2',
        strong && 'border-t border-line pt-1 font-semibold',
      )}
    >
      <dt>{label}</dt>
      <dd>{hours(value)}/sem</dd>
    </div>
  );
}

function shiftWeek(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
