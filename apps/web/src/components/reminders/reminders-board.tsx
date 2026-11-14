'use client';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { reminders } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Reminder = reminders.ReminderDto;
type Discipline = { id: string; name: string };

const CATEGORY: Record<string, string> = {
  tarefa: 'Tarefa',
  leitura: 'Leitura',
  trabalho: 'Trabalho',
  reuniao: 'Reunião',
  prazo: 'Prazo',
  outro: 'Outro',
};
const LEAD: [string, string][] = [
  ['none', 'Sem aviso'],
  ['0', 'Na hora'],
  ['15', '15 minutos antes'],
  ['30', '30 minutos antes'],
  ['60', '1 hora antes'],
  ['120', '2 horas antes'],
  ['1440', '1 dia antes'],
  ['2880', '2 dias antes'],
  ['10080', '1 semana antes'],
];
const DAY = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const fmtDay = (d: string) => DAY.format(new Date(`${d}T12:00:00Z`));

type Draft = {
  id: string | null;
  title: string;
  description: string;
  category: string;
  disciplineId: string;
  date: string;
  allDay: boolean;
  start: string;
  mode: 'lembrar' | 'reservar';
  duration: string;
  lead: string;
};

/*
  Meus lembretes (SPEC v2, LEM-01, 02, 06, 08, 10). "Apenas lembrar" cria só o aviso;
  "Reservar horário" também ocupa o tempo na agenda e o planejamento não usa esse período.
*/
export function RemindersBoard({
  initial,
  done,
  disciplines,
  today,
}: {
  initial: Reminder[];
  done: Reminder[];
  disciplines: Discipline[];
  today: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (draft) ref.current?.showModal?.();
    else ref.current?.close?.();
  }, [draft]);

  const open = (r?: Reminder) => {
    setError('');
    setDraft(
      r
        ? {
            id: r.id,
            title: r.title,
            description: r.description ?? '',
            category: r.category,
            disciplineId: r.disciplineId ?? '',
            date: r.date,
            allDay: r.start === null,
            start: r.start ?? '09:00',
            mode: r.mode,
            duration: String(r.durationMinutes ?? 60),
            lead: r.leadMinutes === null ? 'none' : String(r.leadMinutes),
          }
        : {
            id: null,
            title: '',
            description: '',
            category: 'tarefa',
            disciplineId: '',
            date: today,
            allDay: false,
            start: '09:00',
            mode: 'lembrar',
            duration: '60',
            lead: '30',
          },
    );
  };

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    const body = {
      title: draft.title,
      description: draft.description || null,
      category: draft.category,
      disciplineId: draft.disciplineId || null,
      date: draft.date,
      start: draft.allDay ? null : draft.start,
      mode: draft.allDay ? 'lembrar' : draft.mode,
      durationMinutes: draft.mode === 'reservar' && !draft.allDay ? Number(draft.duration) : null,
      leadMinutes: draft.lead === 'none' ? null : Number(draft.lead),
    };
    try {
      if (draft.id) await api(`/reminders/${draft.id}`, { method: 'PUT', body });
      else await api('/reminders', { method: 'POST', body });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: Reminder) {
    try {
      await api(`/reminders/${r.id}/done`, { method: 'POST', body: { done: !r.done } });
      router.refresh();
    } catch {
      // a lista se atualiza na próxima ação
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api(`/reminders/${draft.id}`, { method: 'DELETE' });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para excluir agora.');
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const row = (r: Reminder) => (
    <li
      key={r.id}
      className="flex items-center gap-3 rounded-[var(--radius)] border border-line p-3"
    >
      <input
        type="checkbox"
        className="size-5"
        checked={r.done}
        onChange={() => toggle(r)}
        aria-label={`${r.title}: ${r.done ? 'marcar como pendente' : 'marcar como realizado'}`}
      />
      <button type="button" className="grid flex-1 gap-0.5 text-left" onClick={() => open(r)}>
        <span className={cn('font-semibold', r.done && 'line-through')}>{r.title}</span>
        <span className="text-sm text-muted">
          {fmtDay(r.date)}
          {r.start ? ` · ${r.start}` : ' · dia todo'} · {CATEGORY[r.category] ?? r.category}
        </span>
      </button>
      {r.mode === 'reservar' ? <Badge tone="accent">Horário reservado</Badge> : null}
    </li>
  );

  return (
    <div className="grid gap-6">
      <div>
        <Button type="button" onClick={() => open()}>
          <Plus className="size-4" aria-hidden /> Novo lembrete
        </Button>
      </div>
      <Card as="section" aria-labelledby="pendentes" className="grid gap-3">
        <h2 id="pendentes" className="text-lg font-semibold">
          Pendentes ({initial.length})
        </h2>
        {initial.length === 0 ? (
          <p className="text-sm text-muted">Nada pendente.</p>
        ) : (
          <ul className="grid gap-2">{initial.map(row)}</ul>
        )}
      </Card>
      {done.length ? (
        <Card as="section" aria-labelledby="feitos" className="grid gap-3">
          <h2 id="feitos" className="text-lg font-semibold">
            Realizados
          </h2>
          <ul className="grid gap-2">{done.map(row)}</ul>
        </Card>
      ) : null}

      <dialog
        ref={ref}
        aria-labelledby="lem-titulo"
        onClose={() => setDraft(null)}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
      >
        {draft ? (
          <form onSubmit={save} className="grid gap-4 p-5">
            <h2 id="lem-titulo" className="text-xl font-semibold">
              {draft.id ? 'Editar lembrete' : 'Novo lembrete'}
            </h2>
            <Field label="Título">
              {(p) => (
                <Input
                  {...p}
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria">
                {(p) => (
                  <Select
                    {...p}
                    value={draft.category}
                    onChange={(e) => set({ category: e.target.value })}
                  >
                    {Object.entries(CATEGORY).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Disciplina" optional>
                {(p) => (
                  <Select
                    {...p}
                    value={draft.disciplineId}
                    onChange={(e) => set({ disciplineId: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
                <Field label="Hora">
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
            {!draft.allDay ? (
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">Na agenda</legend>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    className="size-5"
                    checked={draft.mode === 'lembrar'}
                    onChange={() => set({ mode: 'lembrar' })}
                  />
                  Apenas lembrar (não ocupa horário)
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    className="size-5"
                    checked={draft.mode === 'reservar'}
                    onChange={() => set({ mode: 'reservar' })}
                  />
                  Reservar horário
                </label>
                {draft.mode === 'reservar' ? (
                  <Field label="Duração em minutos">
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        min={5}
                        max={1440}
                        step={5}
                        required
                        value={draft.duration}
                        onChange={(e) => set({ duration: e.target.value })}
                      />
                    )}
                  </Field>
                ) : null}
              </fieldset>
            ) : null}
            <Field label="Quando lembrar">
              {(p) => (
                <Select {...p} value={draft.lead} onChange={(e) => set({ lead: e.target.value })}>
                  {LEAD.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Descrição" optional>
              {(p) => (
                <Textarea
                  {...p}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              )}
            </Field>
            {error ? (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Salvar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              {draft.id ? (
                <Button
                  type="button"
                  variant="danger"
                  className="ml-auto"
                  disabled={busy}
                  onClick={remove}
                >
                  Excluir
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
