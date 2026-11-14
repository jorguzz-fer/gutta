'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { planning } from '@gutta/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Week = planning.WeekDto;
type Session = planning.SessionDto;
type Proposal = planning.ProposalDto;
type Discipline = { id: string; name: string };

const DAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const dayLabel = (d: string) => {
  const s = DAY.format(at(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hours = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`;
};
const BALANCE_TONE = { equilibrada: 'success', intensa: 'warn', revisar: 'warn' } as const;
const BALANCE_TITLE = {
  equilibrada: 'Rotina equilibrada',
  intensa: 'Semana intensa',
  revisar: 'Planejamento a revisar',
} as const;
const STATUS_LABEL: Partial<Record<Session['status'], string>> = {
  done: 'Feita',
  partly_done: 'Feita em parte',
};
const REASONS = ['Plantão ou estágio', 'Compromisso pessoal', 'Descanso', 'Outro motivo'];

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para fazer isso agora.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

function byDay<T extends { date: string }>(list: T[]) {
  const map = new Map<string, T[]>();
  for (const x of list) map.set(x.date, [...(map.get(x.date) ?? []), x]);
  return [...map.entries()];
}

/** Editar horário, dia ou duração de uma sessão (EQU-07). */
function EditSession({ s, onDone }: { s: Session; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [date, setDate] = useState(s.date);
  const [start, setStart] = useState(s.startLocal);
  const [minutes, setMinutes] = useState(s.minutes);
  return (
    <form
      className="grid gap-2 rounded-[var(--radius)] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api(`/planning/sessions/${s.id}`, {
            method: 'PATCH',
            body: { date, start, minutes },
          });
          onDone();
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm">
          Dia
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Início
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Duração
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
          >
            {[...new Set([10, 15, 20, 30, 45, 60, 90, s.minutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" loading={busy}>
          Salvar horário
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Proposta para o aluno decidir (EQU-06 a EQU-09). Nada entra na agenda antes de aceitar. */
function ProposalReview({ p, semana }: { p: Proposal; semana: string }) {
  const { busy, error, run } = useAction();
  const [chosen, setChosen] = useState(() => new Set(p.sessions.map((s) => s.id)));
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const total = p.sessions.filter((s) => chosen.has(s.id)).reduce((n, s) => n + s.minutes, 0);
  const decide = (accept: string[]) =>
    run(() =>
      api(`/planning/proposals/${p.id}/decision`, {
        method: 'POST',
        body: { accept, reason: reason || undefined },
      }),
    );
  return (
    <Card as="section" aria-labelledby="proposta" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="proposta" className="text-xl font-semibold">
          {p.kind === 'replanejar'
            ? 'Nova proposta para o que ficou pendente'
            : 'Proposta da semana'}
        </h2>
        <p className="text-sm text-muted">
          Nada entra na sua agenda antes de você aceitar. Desmarque o que não quiser, ajuste o
          horário ou peça outro plano.
        </p>
      </div>
      {p.sessions.length === 0 ? (
        <p>Nenhuma sessão coube nos seus horários de estudo desta semana.</p>
      ) : (
        <ol className="grid gap-4">
          {byDay(p.sessions).map(([d, list]) => (
            <li key={d} className="grid gap-2">
              <h3 className="font-semibold">{dayLabel(d)}</h3>
              <ul className="grid gap-2">
                {list.map((s) => (
                  <li
                    key={s.id}
                    className="grid gap-2 rounded-[var(--radius)] border border-line p-3"
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={chosen.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setChosen(next);
                        }}
                        className="mt-1 size-5 accent-[var(--accent)]"
                        aria-label={`Manter ${s.title} às ${s.startLocal}`}
                      />
                      <span className="grid gap-0.5">
                        <span className="font-semibold">
                          {s.startLocal} às {s.endLocal} · {s.title}
                          {s.parts && s.parts > 1 ? ` (parte ${s.part} de ${s.parts})` : ''}
                        </span>
                        {s.disciplineName ? (
                          <span className="text-sm text-muted">{s.disciplineName}</span>
                        ) : null}
                        {s.reasons.length ? (
                          <span className="text-sm">Por quê: {s.reasons.join('; ')}.</span>
                        ) : null}
                      </span>
                    </label>
                    {editing === s.id ? (
                      <EditSession s={s} onDone={() => setEditing(null)} />
                    ) : (
                      <div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2"
                          onClick={() => setEditing(s.id)}
                        >
                          Mudar horário
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {p.unplaced.length ? (
        <section aria-labelledby="nao-coube" className="grid gap-2">
          <h3 id="nao-coube" className="font-semibold">
            O que não coube
          </h3>
          <ul className="grid gap-2">
            {p.unplaced.map((u) => (
              <li
                key={u.taskId}
                className="grid gap-1 rounded-[var(--radius)] border border-line p-3"
              >
                <span className="font-semibold">
                  {u.title} · {hours(u.minutes)}
                </span>
                <span className="text-sm">{u.explanation}</span>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        api(`/planning/tasks/${u.taskId}`, {
                          method: 'PATCH',
                          body: { status: 'adiada' },
                        }),
                      )
                    }
                  >
                    Adiar esta tarefa
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {p.kind === 'replanejar' ? (
        <div className="grid max-w-sm gap-1">
          <label htmlFor="motivo" className="text-sm font-semibold">
            Motivo da mudança (opcional)
          </label>
          <select
            id="motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
          >
            <option value="">Prefiro não dizer</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          loading={busy}
          disabled={chosen.size === 0}
          onClick={() => decide([...chosen])}
        >
          {chosen.size === p.sessions.length ? 'Aceitar tudo' : 'Aceitar as marcadas'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(() =>
              api('/planning/proposals', {
                method: 'POST',
                body: {
                  semana,
                  kind: p.kind,
                  variant: Math.floor(Math.random() * 1000) + 1,
                },
              }),
            )
          }
        >
          Pedir outro plano
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => decide([])}>
          Recusar
        </Button>
        {p.sessions.length ? (
          <span className="text-sm text-muted">{hours(total)} selecionadas</span>
        ) : null}
      </div>
    </Card>
  );
}

/** Uma sessão na agenda: registro opcional de um toque (EQU-11). */
function SessionRow({ s, past }: { s: Session; past: boolean }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [partial, setPartial] = useState(false);
  const [minutes, setMinutes] = useState(Math.round(s.minutes / 2));
  const mark = (status: 'done' | 'partly_done' | 'skipped' | 'confirmed', m?: number) =>
    run(() =>
      api(`/planning/sessions/${s.id}/status`, { method: 'POST', body: { status, minutes: m } }),
    );
  const registered = s.status === 'done' || s.status === 'partly_done';
  return (
    <li className="grid gap-2 rounded-[var(--radius)] border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {s.startLocal} às {s.endLocal} · {s.title}
        </span>
        {STATUS_LABEL[s.status] ? (
          <Badge tone="success">
            {STATUS_LABEL[s.status]}
            {s.status === 'partly_done' ? ` (${s.doneMinutes} min)` : ''}
          </Badge>
        ) : null}
      </div>
      {s.reasons.length ? <p className="text-sm text-muted">{s.reasons.join('; ')}</p> : null}
      {editing ? <EditSession s={s} onDone={() => setEditing(false)} /> : null}
      {partial ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mark('partly_done', minutes);
          }}
        >
          <label className="grid gap-1 text-sm">
            Quantos minutos você fez?
            <input
              type="number"
              min={1}
              max={s.minutes}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="min-h-11 w-28 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
            />
          </label>
          <Button type="submit" variant="secondary" loading={busy}>
            Registrar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPartial(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {registered ? (
          <Button
            type="button"
            variant="ghost"
            className="px-2"
            disabled={busy}
            onClick={() => mark('confirmed')}
          >
            Desfazer registro
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => mark('done')}>
              Fiz
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="px-2"
              disabled={busy}
              onClick={() => setPartial(true)}
            >
              Fiz parte
            </Button>
            {!past ? (
              <Button
                type="button"
                variant="ghost"
                className="px-2"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Mudar horário
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="px-2"
              disabled={busy}
              onClick={() => run(() => api(`/planning/sessions/${s.id}`, { method: 'DELETE' }))}
            >
              Tirar da agenda
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function NewTask({ disciplines }: { disciplines: Discipline[] }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [dueDate, setDueDate] = useState('');
  const [difficulty, setDifficulty] = useState('');
  if (!open)
    return (
      <div>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Nova tarefa de estudo
        </Button>
      </div>
    );
  return (
    <form
      className="grid max-w-xl gap-3 rounded-[var(--radius)] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api('/planning/tasks', {
            method: 'POST',
            body: {
              title,
              disciplineId: disciplineId || null,
              estimatedMinutes: minutes,
              dueDate: dueDate || null,
              difficulty: difficulty || null,
            },
          });
          setOpen(false);
          setTitle('');
        });
      }}
    >
      <label className="grid gap-1 text-sm font-semibold">
        O que estudar
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3 font-normal"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Disciplina
          <select
            value={disciplineId}
            onChange={(e) => setDisciplineId(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 font-normal"
          >
            <option value="">Nenhuma</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Tempo estimado
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 font-normal"
          >
            {[30, 60, 90, 120, 180, 240].map((m) => (
              <option key={m} value={m}>
                {hours(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Prazo (opcional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 font-normal"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Dificuldade
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 font-normal"
          >
            <option value="">Não sei</option>
            <option value="facil">Fácil</option>
            <option value="moderado">Moderada</option>
            <option value="dificil">Difícil</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Adicionar tarefa
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/*
  Equilíbrio (SPEC v2, 5.4; telas T07 a T09): a semana com os três indicadores separados, o
  estado da semana, a proposta para decidir, as sessões, o que ficou para trás e as tarefas.
*/
export function WeekBoard({
  week: w,
  disciplines,
  rotina,
}: {
  week: Week;
  disciplines: Discipline[];
  rotina: boolean;
}) {
  const { busy, error, run } = useAction();
  const now = new Date().toISOString();
  const generate = (kind: 'semana' | 'replanejar', sessionIds?: string[]) =>
    run(() =>
      api('/planning/proposals', {
        method: 'POST',
        body: { semana: w.weekStart, kind, sessionIds },
      }),
    );
  const upcoming = w.sessions.filter((s) => s.status === 'confirmed' && s.end > now);
  return (
    <div className="grid gap-6">
      <Alert tone={BALANCE_TONE[w.balance.state]} role="status">
        <p className="font-semibold">
          Minha semana está equilibrada? {BALANCE_TITLE[w.balance.state]}
        </p>
        <p>{w.balance.message}</p>
        {w.balance.state === 'revisar' && upcoming.length ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => generate('replanejar')}
            >
              Reorganizar o que falta
            </Button>
          </div>
        ) : null}
      </Alert>

      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Indicadores da semana">
        {(
          [
            [
              'Tempo disponível',
              w.indicators.availableMinutes,
              'Seus horários de estudo na rotina',
            ],
            ['Tempo planejado', w.indicators.plannedMinutes, 'Sessões que você confirmou'],
            ['Tempo realizado', w.indicators.doneMinutes, 'Sessões que você registrou como feitas'],
          ] as const
        ).map(([label, m, hint]) => (
          <li key={label}>
            <Card className="grid h-full gap-1">
              <p className="text-sm text-muted">{label}</p>
              <p className="text-2xl font-bold">{hours(m)}</p>
              <p className="text-sm text-muted">{hint}</p>
            </Card>
          </li>
        ))}
      </ul>

      {!w.hasStudyWindows ? (
        <Alert>
          <p>
            O Equilíbrio só sugere estudo nos horários que você autorizar.{' '}
            {rotina ? (
              <Link href="/app/rotina">Marque na rotina quando você pode estudar</Link>
            ) : (
              'Marque na rotina quando você pode estudar'
            )}
            .
          </p>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {w.proposal ? (
        <ProposalReview key={w.proposal.id} p={w.proposal} semana={w.weekStart} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            loading={busy}
            disabled={!w.hasStudyWindows}
            onClick={() => generate('semana')}
          >
            Gerar proposta de estudos
          </Button>
          {upcoming.length ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => generate('replanejar')}
            >
              Replanejar minha semana
            </Button>
          ) : null}
          <span className="text-sm text-muted">
            {w.tasks.length
              ? `${w.tasks.length} ${w.tasks.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}.`
              : 'Sem tarefas pendentes: crie uma ou peça revisões na aula, na falta, na prova ou na nota.'}
          </span>
        </div>
      )}

      {w.behind.length ? (
        <Card as="section" aria-labelledby="para-tras" className="grid gap-3">
          <h2 id="para-tras" className="text-lg font-semibold">
            Sessões que ficaram para trás
          </h2>
          <p className="text-sm text-muted">
            Nada se move sozinho. Registre o que fez, deixe de lado ou reorganize em novos horários.
          </p>
          <ul className="grid gap-2">
            {w.behind.map((s) => (
              <SessionRow key={s.id} s={s} past />
            ))}
          </ul>
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || Boolean(w.proposal)}
              onClick={() =>
                generate(
                  'replanejar',
                  w.behind.map((s) => s.id),
                )
              }
            >
              Reorganizar em novos horários
            </Button>
          </div>
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="sessoes" className="grid gap-3">
        <h2 id="sessoes" className="text-lg font-semibold">
          Sessões da semana
        </h2>
        {w.sessions.length === 0 ? (
          <p className="text-sm">Nenhuma sessão confirmada nesta semana.</p>
        ) : (
          <ol className="grid gap-4">
            {byDay(w.sessions).map(([d, list]) => (
              <li key={d} className="grid gap-2">
                <h3 className="font-semibold">{dayLabel(d)}</h3>
                <ul className="grid gap-2">
                  {list.map((s) => (
                    <SessionRow key={s.id} s={s} past={s.end <= now} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card as="section" aria-labelledby="tarefas" className="grid gap-3">
        <h2 id="tarefas" className="text-lg font-semibold">
          Tarefas pendentes
        </h2>
        {w.tasks.length ? (
          <ul className="grid gap-2">
            {w.tasks.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
              >
                <span>
                  <span className="font-semibold">{t.title}</span>
                  <span className="text-sm text-muted">
                    {' · '}
                    {[
                      t.disciplineName,
                      `${hours(t.estimatedMinutes)} no total`,
                      t.dueDate
                        ? `até ${at(t.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                        : null,
                      t.plannedMinutes ? `${hours(t.plannedMinutes)} na agenda` : null,
                      t.doneMinutes ? `${hours(t.doneMinutes)} feitos` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2"
                    disabled={busy}
                    aria-label={`Adiar ${t.title}`}
                    onClick={() =>
                      run(() =>
                        api(`/planning/tasks/${t.id}`, {
                          method: 'PATCH',
                          body: { status: 'adiada' },
                        }),
                      )
                    }
                  >
                    Adiar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2"
                    disabled={busy}
                    aria-label={`Descartar ${t.title}`}
                    onClick={() =>
                      run(() =>
                        api(`/planning/tasks/${t.id}`, {
                          method: 'PATCH',
                          body: { status: 'descartada' },
                        }),
                      )
                    }
                  >
                    Descartar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Nenhuma tarefa pendente.</p>
        )}
        <NewTask disciplines={disciplines} />
        <Link
          href="/app/equilibrio/preferencias"
          className={buttonClass('ghost', 'md', 'justify-self-start px-2')}
        >
          Preferências e limites
        </Link>
      </Card>
    </div>
  );
}
