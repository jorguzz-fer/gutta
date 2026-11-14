'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { agenda, calendar } from '@gutta/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';

type Item = agenda.AgendaItemDto;
type Discipline = { id: string; name: string };

/** Tipo escolhido no formulário (CAL-03): decide em que tabela o fato mora (CAL-16). */
type Kind =
  | 'compromisso'
  | 'estudo'
  | 'revisao'
  | 'lazer'
  | 'descanso'
  | 'outro'
  | 'aula'
  | 'pratica'
  | 'prova'
  | 'atividade'
  | 'entrega';

const KINDS: [Kind, string][] = [
  ['compromisso', 'Compromisso'],
  ['estudo', 'Estudo'],
  ['revisao', 'Revisão'],
  ['aula', 'Aula'],
  ['pratica', 'Prática'],
  ['prova', 'Prova'],
  ['atividade', 'Atividade'],
  ['entrega', 'Entrega ou trabalho'],
  ['lazer', 'Lazer'],
  ['descanso', 'Descanso'],
  ['outro', 'Outro'],
];
const LESSON = new Set<Kind>(['aula', 'pratica']);
const ASSESSMENT = new Set<Kind>(['prova', 'atividade', 'entrega']);
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Repeat = 'none' | 'weekly' | 'daily' | 'monthly';
type Draft = {
  source: 'event' | 'lesson' | 'assessment' | null; // null: novo
  id: string | null;
  kind: Kind;
  title: string;
  disciplineId: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string;
  notes: string;
  repeat: Repeat;
  weekdays: number[];
  until: string;
  /** Data original da ocorrência clicada, numa série. */
  occurrence: string | null;
  recurring: boolean;
  importedNote: string | null;
};

const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

export type EditorTarget = { mode: 'new'; date: string } | { mode: 'edit'; item: Item };

/*
  Criar e editar no calendário (SPEC v2, CAL-02, CAL-04, CAL-06, CAL-07). Compromisso aceita
  repetição; ao mudar ou excluir uma ocorrência de série, o aluno escolhe só esta, esta e as
  próximas, ou toda a série. Aula e prova vão para a tabela delas, as mesmas das Notas.
*/
export function EventEditor({
  target,
  disciplines,
  defaultDiscipline,
  lessonStudy = false,
  onClose,
}: {
  target: EditorTarget;
  disciplines: Discipline[];
  defaultDiscipline?: string;
  lessonStudy?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const base: Draft = {
    source: null,
    id: null,
    kind: 'compromisso',
    title: '',
    disciplineId: defaultDiscipline ?? '',
    date: target.mode === 'new' ? target.date : target.item.date,
    allDay: false,
    start: '09:00',
    end: '10:00',
    location: '',
    notes: '',
    repeat: 'none',
    weekdays: [],
    until: '',
    occurrence: null,
    recurring: false,
    importedNote: null,
  };
  // Novo: o formulário já nasce pronto. Edição: carrega da API (o componente monta por alvo).
  const [draft, setDraft] = useState<Draft | null>(target.mode === 'new' ? base : null);
  const [scope, setScope] = useState<'this' | 'following' | 'all'>('this');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal?.();
  }, []);

  useEffect(() => {
    if (target.mode !== 'edit') return;
    const item = target.item;
    const load = async () => {
      try {
        if (item.source === 'event') {
          const { event } = await api<{ event: calendar.EventDto }>(
            `/calendar/events/${item.sourceId}`,
          );
          const r = event.recurrence;
          setDraft({
            ...base,
            source: 'event',
            id: event.id,
            kind: event.kind,
            title: event.title,
            disciplineId: event.disciplineId ?? '',
            notes: event.notes ?? '',
            // Numa série, o formulário abre na ocorrência clicada.
            date: r ? item.date : event.date,
            allDay: event.start === null,
            start: (r ? item.startLocal : event.start) ?? '09:00',
            end: (r ? item.endLocal : event.end) ?? '10:00',
            repeat: r ? (r.freq === 'dates' ? 'none' : r.freq) : 'none',
            weekdays: r?.freq === 'weekly' ? r.weekdays : [],
            until: r && r.freq !== 'dates' ? (r.until ?? '') : '',
            occurrence: r ? item.id.split(':').at(-1)! : null,
            recurring: Boolean(r),
          });
        } else if (item.source === 'lesson') {
          const { lesson } = await api<{ lesson: calendar.LessonDto }>(`/lessons/${item.sourceId}`);
          setDraft({
            ...base,
            source: 'lesson',
            id: lesson.id,
            kind: lesson.kind,
            title: lesson.title,
            disciplineId: lesson.disciplineId,
            date: lesson.date,
            allDay: lesson.start === null,
            start: lesson.start ?? '09:00',
            end: lesson.end ?? lesson.start ?? '10:00',
            location: lesson.location ?? '',
            importedNote: originalNote(lesson.origin, lesson.modifiedByStudent, lesson.original),
          });
        } else if (item.source === 'assessment') {
          const { assessment: a } = await api<{ assessment: calendar.AssessmentDto }>(
            `/assessments/${item.sourceId}`,
          );
          setDraft({
            ...base,
            source: 'assessment',
            id: a.id,
            kind: a.kind,
            title: a.name,
            disciplineId: a.disciplineId,
            date: a.date ?? item.date,
            allDay: a.start === null,
            start: a.start ?? '09:00',
            notes: a.topicNote ?? '',
            importedNote: originalNote(a.origin, a.modifiedByStudent, a.original),
          });
        }
      } catch (err) {
        setError(err instanceof ClientApiError ? err.message : 'Não deu para abrir agora.');
      }
    };
    void load();
    // Monta uma vez por alvo (a chave do componente muda a cada clique).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (
    target.mode === 'edit' &&
    (target.item.source === 'routine' || target.item.source === 'reminder')
  ) {
    const routine = target.item.source === 'routine';
    return (
      <dialog
        ref={ref}
        aria-labelledby="ev-titulo"
        onClose={onClose}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-5 text-fg backdrop:bg-black/50"
      >
        <div className="grid gap-3">
          <h2 id="ev-titulo" className="text-xl font-semibold">
            {target.item.title}
          </h2>
          <p className="text-sm text-muted">
            {routine ? 'Faz parte da sua rotina semanal.' : 'Lembrete (não ocupa horário).'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={routine ? '/app/rotina' : '/app/lembretes'}>
              {routine ? 'Editar na rotina' : 'Abrir em Meus lembretes'}
            </Link>
            <Button type="button" variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </dialog>
    );
  }

  const isNew = draft?.source === null;
  const kindLocked = draft && !isNew;
  const needsDiscipline = draft && (LESSON.has(draft.kind) || ASSESSMENT.has(draft.kind));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const time = draft.allDay
      ? { start: null, end: null }
      : { start: draft.start, end: draft.end || null };
    try {
      if (LESSON.has(draft.kind) || (draft.source === 'lesson' && draft.kind === 'outro')) {
        const body = {
          disciplineId: draft.disciplineId,
          kind: draft.kind,
          title: draft.title,
          location: draft.location || null,
          date: draft.date,
          ...(draft.allDay ? { start: null, end: null } : { start: draft.start, end: draft.end }),
        };
        if (draft.id) await api(`/lessons/${draft.id}`, { method: 'PUT', body });
        else await api('/lessons', { method: 'POST', body });
      } else if (ASSESSMENT.has(draft.kind)) {
        const body = {
          disciplineId: draft.disciplineId,
          kind: draft.kind,
          name: draft.title,
          topicNote: draft.notes || null,
          date: draft.date,
          start: draft.allDay ? null : draft.start,
        };
        if (draft.id) await api(`/assessments/${draft.id}`, { method: 'PUT', body });
        else await api('/assessments', { method: 'POST', body });
      } else {
        const recurrence =
          draft.repeat === 'none'
            ? null
            : draft.repeat === 'weekly'
              ? {
                  freq: 'weekly' as const,
                  weekdays: draft.weekdays.length ? draft.weekdays : [weekdayOf(draft.date)],
                  until: draft.until || null,
                }
              : { freq: draft.repeat, until: draft.until || null };
        const body = {
          kind: draft.kind,
          title: draft.title,
          notes: draft.notes || null,
          disciplineId: draft.disciplineId || null,
          blocksTime: true,
          recurrence,
          date: draft.date,
          ...(draft.allDay ? { start: null, end: null } : time),
        };
        if (draft.id)
          await api(`/calendar/events/${draft.id}`, {
            method: 'PUT',
            body: {
              scope: draft.recurring ? scope : 'all',
              occurrenceDate: draft.occurrence ?? undefined,
              event: body,
            },
          });
        else await api('/calendar/events', { method: 'POST', body });
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    setError('');
    try {
      if (draft.source === 'lesson') await api(`/lessons/${draft.id}`, { method: 'DELETE' });
      else if (draft.source === 'assessment')
        await api(`/assessments/${draft.id}`, { method: 'DELETE' });
      else {
        const q = draft.recurring ? `?scope=${scope}&date=${draft.occurrence}` : '?scope=all';
        await api(`/calendar/events/${draft.id}${q}`, { method: 'DELETE' });
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para excluir agora.');
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });

  return (
    <dialog
      ref={ref}
      aria-labelledby="ev-titulo"
      onClose={onClose}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      {draft ? (
        <form onSubmit={save} className="grid gap-4 p-5">
          <h2 id="ev-titulo" className="text-xl font-semibold">
            {isNew ? 'Novo evento' : 'Editar evento'}
          </h2>
          {draft.importedNote ? <Alert>{draft.importedNote}</Alert> : null}
          {lessonStudy && draft.source === 'lesson' && draft.id ? (
            <Link href={`/app/aulas/${draft.id}`} className={buttonClass('secondary')}>
              Acompanhar esta aula
            </Link>
          ) : null}
          <Field label="Tipo">
            {(p) => (
              <Select
                {...p}
                value={draft.kind}
                disabled={Boolean(kindLocked)}
                onChange={(e) => set({ kind: e.target.value as Kind })}
              >
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Título">
            {(p) => (
              <Input
                {...p}
                value={draft.title}
                required
                maxLength={200}
                onChange={(e) => set({ title: e.target.value })}
              />
            )}
          </Field>
          <Field label="Disciplina" optional={!needsDiscipline}>
            {(p) => (
              <Select
                {...p}
                value={draft.disciplineId}
                required={Boolean(needsDiscipline)}
                onChange={(e) => set({ disciplineId: e.target.value })}
              >
                <option value="">{needsDiscipline ? 'Escolha a disciplina' : 'Nenhuma'}</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Data">
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              )}
            </Field>
            {!draft.allDay ? (
              <>
                <Field label="Início">
                  {(p) => (
                    <Input
                      {...p}
                      type="time"
                      required
                      value={draft.start}
                      onChange={(e) => set({ start: e.target.value })}
                    />
                  )}
                </Field>
                {ASSESSMENT.has(draft.kind) ? null : (
                  <Field label="Fim">
                    {(p) => (
                      <Input
                        {...p}
                        type="time"
                        required
                        value={draft.end}
                        onChange={(e) => set({ end: e.target.value })}
                      />
                    )}
                  </Field>
                )}
              </>
            ) : null}
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.allDay}
              onChange={(e) => set({ allDay: e.target.checked })}
            />
            Dia todo
          </label>
          {LESSON.has(draft.kind) ? (
            <Field label="Local" optional>
              {(p) => (
                <Input
                  {...p}
                  value={draft.location}
                  maxLength={120}
                  onChange={(e) => set({ location: e.target.value })}
                />
              )}
            </Field>
          ) : (
            <Field label={ASSESSMENT.has(draft.kind) ? 'Conteúdo cobrado' : 'Observações'} optional>
              {(p) => (
                <Textarea
                  {...p}
                  value={draft.notes}
                  maxLength={2000}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              )}
            </Field>
          )}
          {!LESSON.has(draft.kind) && !ASSESSMENT.has(draft.kind) && draft.source !== 'lesson' ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Repetição</legend>
              <Select
                aria-label="Repetição"
                value={draft.repeat}
                onChange={(e) => set({ repeat: e.target.value as Repeat })}
              >
                <option value="none">Não repete</option>
                <option value="weekly">Toda semana</option>
                <option value="daily">Todo dia</option>
                <option value="monthly">Todo mês</option>
              </Select>
              {draft.repeat === 'weekly' ? (
                <div className="flex flex-wrap gap-2">
                  {SHORT.map((d, i) => (
                    <label
                      key={d}
                      className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] border border-line px-3"
                    >
                      <input
                        type="checkbox"
                        checked={
                          draft.weekdays.length
                            ? draft.weekdays.includes(i)
                            : weekdayOf(draft.date) === i
                        }
                        onChange={(e) => {
                          const cur = draft.weekdays.length
                            ? draft.weekdays
                            : [weekdayOf(draft.date)];
                          set({
                            weekdays: e.target.checked
                              ? [...new Set([...cur, i])].sort()
                              : cur.filter((w) => w !== i),
                          });
                        }}
                      />
                      <span aria-hidden>{d}</span>
                      <span className="sr-only">{DAYS[i]}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {draft.repeat !== 'none' ? (
                <Field label="Até" optional>
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={draft.until}
                      onChange={(e) => set({ until: e.target.value })}
                    />
                  )}
                </Field>
              ) : null}
            </fieldset>
          ) : null}
          {draft.recurring ? (
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium">Aplicar a</legend>
              {(
                [
                  ['this', 'Só esta'],
                  ['following', 'Esta e as próximas'],
                  ['all', 'Toda a série'],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    className="size-5"
                    checked={scope === v}
                    onChange={() => setScope(v)}
                  />
                  {l}
                </label>
              ))}
            </fieldset>
          ) : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Salvar
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={remove}
                className="ml-auto"
              >
                Excluir
              </Button>
            ) : null}
          </div>
        </form>
      ) : error ? (
        <div className="grid gap-3 p-5">
          <Alert tone="danger">{error}</Alert>
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <p className="p-5">Carregando…</p>
      )}
    </dialog>
  );
}

function originalNote(
  origin: 'imported' | 'manual',
  modified: boolean,
  original: Record<string, unknown> | null,
): string | null {
  if (origin !== 'imported') return null;
  const o = original as { date?: string; start?: string | null; title?: string } | null;
  const when = o?.date
    ? `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}${o.start ? ` às ${o.start}` : ''}`
    : '';
  return modified
    ? `Veio do cronograma e você já alterou. No cronograma: ${o?.title ?? ''}${when ? `, ${when}` : ''}.`
    : 'Veio do cronograma. Se mudar aqui, o próximo cronograma não sobrescreve a sua versão.';
}
