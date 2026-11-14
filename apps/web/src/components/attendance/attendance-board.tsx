'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { attendance } from '@gutta/contracts';
import { RequestReview } from '@/components/planning/request-review';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Dto = attendance.AttendanceDto;

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const STATUS = {
  dentro: { label: 'Dentro do limite', tone: 'success' as const },
  atencao: { label: 'Perto do limite', tone: 'warn' as const },
  no_limite: { label: 'No limite', tone: 'warn' as const },
  acima: { label: 'Acima do limite', tone: 'danger' as const },
};
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const fmtHours = (n: number) =>
  `${String(n).replace('.', ',')} ${n === 1 ? 'hora-aula' : 'horas-aula'}`;

function shiftMonth(m: string, n: number) {
  const d = at(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/*
  Faltas da disciplina (SPEC v2, FAL-01 a FAL-05, FAL-13; tela T21). Configuração, indicadores,
  calendário dos dias de aula e histórico. É um controle pessoal: a frequência oficial é a da
  instituição.
*/
export function AttendanceBoard({
  initial,
  planning = false,
}: {
  initial: Dto;
  /** Equilíbrio ligado: a falta oferece a revisão da aula perdida (FAL-08). */
  planning?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [cfg, setCfg] = useState({
    total: String(initial.rule?.totalClassHours ?? ''),
    min: String(initial.rule?.minAttendancePct ?? 75),
    perMeeting: String(initial.rule?.classHoursPerMeeting ?? 2),
    weekdays: initial.rule?.weekdays ?? [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/disciplines/${data.disciplineId}`;

  async function run(fn: () => Promise<{ attendance: Dto }>) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      setData(res.attendance);
      return true;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveRule = (ev: React.FormEvent) => {
    ev.preventDefault();
    void run(() =>
      api(`${base}/attendance/rule`, {
        method: 'PUT',
        body: {
          totalClassHours: Number(cfg.total.replace(',', '.')),
          minAttendancePct: Number(cfg.min),
          classHoursPerMeeting: Number(cfg.perMeeting.replace(',', '.')),
          weekdays: cfg.weekdays.length ? cfg.weekdays : null,
          alertThresholds: data.rule?.alertThresholds ?? [50, 75, 90],
        },
      }),
    );
  };

  const day = data.classDays.find((d) => d.date === selected);
  const choose = (d: Dto['classDays'][number]) => {
    setSelected(d.date);
    const a = data.absences.find((x) => x.id === d.absenceId);
    setHours(String(a?.classHours ?? d.classHours));
    setNote(a?.note ?? '');
  };
  const record = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!day) return;
    await run(() =>
      api(`${base}/absences`, {
        method: 'POST',
        body: {
          date: day.date,
          lessonId: day.lessonId,
          classHours: Number(hours.replace(',', '.')),
          note: note || null,
        },
      }),
    );
  };
  const remove = (id: string) => run(() => api(`${base}/absences/${id}`, { method: 'DELETE' }));
  const month = (m: string) => run(() => api(`${base}/attendance?month=${m}`));

  // Calendário do mês, com os dias de aula marcados.
  const first = at(`${data.month}-01`);
  const lead = first.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${data.month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7) cells.push(null);
  const s = data.summary;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid min-w-0 content-start gap-6">
        <Card as="section" aria-labelledby="indicadores" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="indicadores" className="text-lg font-semibold">
              Indicadores
            </h2>
            {s ? <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge> : null}
          </div>
          {s ? (
            <>
              <dl className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-sm text-muted">Limite de faltas</dt>
                  <dd className="text-2xl font-bold">{String(s.limit).replace('.', ',')}</dd>
                  <dd className="text-xs text-muted">horas-aula</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Minhas faltas</dt>
                  <dd className="text-2xl font-bold">{String(s.registered).replace('.', ',')}</dd>
                  <dd className="text-xs text-muted">horas-aula</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Restantes</dt>
                  <dd className="text-2xl font-bold">{String(s.remaining).replace('.', ',')}</dd>
                  <dd className="text-xs text-muted">horas-aula</dd>
                </div>
              </dl>
              <div
                role="progressbar"
                aria-label="Parte do limite de faltas usada"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, s.usedPct)}
                className="h-2 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, s.usedPct)}%` }}
                />
              </div>
              <p className="text-sm text-muted">{s.usedPct}% do limite usado.</p>
            </>
          ) : (
            <p className="text-sm">
              Configure a carga horária e a frequência mínima da disciplina para ver o limite.
            </p>
          )}
        </Card>

        <Card as="section" aria-labelledby="calendario" className="grid gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Mês anterior"
              className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
              onClick={() => month(shiftMonth(data.month, -1))}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <h2 id="calendario" className="text-lg font-semibold first-letter:uppercase">
              {MONTH.format(first)}
            </h2>
            <button
              type="button"
              aria-label="Próximo mês"
              className="grid size-11 place-items-center rounded-[var(--radius)] hover:bg-surface-2"
              onClick={() => month(shiftMonth(data.month, 1))}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          {data.classDays.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhum dia de aula neste mês. Os dias vêm do cronograma ou dos dias de aula da
              configuração.
            </p>
          ) : null}
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Dias de aula do mês; escolha um para registrar</caption>
            <thead>
              <tr>
                {WEEK.map((w) => (
                  <th key={w} scope="col" className="p-1 font-semibold">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, w) => (
                <tr key={w}>
                  {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
                    if (!d) return <td key={`v${w}${i}`} />;
                    const cls = data.classDays.find((c) => c.date === d);
                    const n = Number(d.slice(8, 10));
                    return (
                      <td key={d} className="p-0.5">
                        {cls ? (
                          <button
                            type="button"
                            onClick={() => choose(cls)}
                            aria-pressed={selected === d}
                            aria-label={`${DAY.format(at(d))}, dia de aula${cls.absenceId ? ', falta registrada' : ''}`}
                            className={cn(
                              'grid min-h-11 w-full place-items-center rounded-[4px] border text-xs font-semibold',
                              cls.absenceId
                                ? 'border-danger bg-danger-soft text-danger'
                                : 'border-success bg-success-soft text-success',
                              selected === d && 'ring-2 ring-accent',
                            )}
                          >
                            {n}
                            <span>{cls.absenceId ? 'falta' : 'aula'}</span>
                          </button>
                        ) : (
                          <span className="grid min-h-11 place-items-center text-muted">{n}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {day ? (
            <form onSubmit={record} className="grid gap-3 border-t border-line pt-3">
              <h3 className="font-semibold">
                Registrar ausência em {DAY.format(at(day.date))}
                {day.title ? ` · ${day.title}` : ''}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Horas-aula perdidas" hint={`A aula tem ${fmtHours(day.classHours)}.`}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      required
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Observação" optional>
                  {(p) => (
                    <Input
                      {...p}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !s}>
                  {day.absenceId ? 'Atualizar registro' : 'Registrar falta'}
                </Button>
                {day.absenceId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => remove(day.absenceId!)}
                  >
                    Remover registro
                  </Button>
                ) : null}
              </div>
              {!s ? (
                <p className="text-sm text-muted">Configure a disciplina antes de registrar.</p>
              ) : null}
            </form>
          ) : null}
        </Card>

        <Card as="section" aria-labelledby="historico" className="grid gap-3">
          <h2 id="historico" className="text-lg font-semibold">
            Minhas faltas
          </h2>
          {data.absences.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma falta registrada.</p>
          ) : (
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Histórico de faltas"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="p-2">
                      Data
                    </th>
                    <th scope="col" className="p-2">
                      Aula
                    </th>
                    <th scope="col" className="p-2">
                      Horas-aula
                    </th>
                    <th scope="col" className="p-2">
                      Observação
                    </th>
                    <th scope="col" className="p-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.absences.map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="p-2">{DAY.format(at(a.date))}</td>
                      <td className="p-2">{a.lessonTitle ?? '—'}</td>
                      <td className="p-2">{String(a.classHours).replace('.', ',')}</td>
                      <td className="p-2">{a.note ?? ''}</td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => remove(a.id)}
                        >
                          Remover
                        </Button>
                        {planning ? (
                          <RequestReview
                            kind="falta"
                            id={a.id}
                            label="Pedir revisão da aula perdida"
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="p-2" colSpan={2}>
                      Total
                    </td>
                    <td className="p-2">{String(s?.registered ?? 0).replace('.', ',')}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      <aside className="grid content-start gap-4">
        <Card as="section" aria-labelledby="config" className="grid gap-3">
          <h2 id="config" className="text-lg font-semibold">
            Configuração da disciplina
          </h2>
          <form onSubmit={saveRule} className="grid gap-3">
            <Field label="Carga horária (horas-aula)">
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  required
                  value={cfg.total}
                  onChange={(e) => setCfg({ ...cfg, total: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Frequência mínima exigida"
              hint="O limite de faltas é o restante. Confira a regra da sua instituição."
            >
              {(p) => (
                <Select
                  {...p}
                  value={cfg.min}
                  onChange={(e) => setCfg({ ...cfg, min: e.target.value })}
                >
                  {[50, 60, 70, 75, 80, 85, 90, 100].map((v) => (
                    <option key={v} value={v}>
                      {v}% (até {100 - v}% de faltas)
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Horas-aula por encontro">
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  required
                  value={cfg.perMeeting}
                  onChange={(e) => setCfg({ ...cfg, perMeeting: e.target.value })}
                />
              )}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Dias de aula (sem cronograma)</legend>
              <div className="flex flex-wrap gap-2">
                {WEEK.map((w, i) => (
                  <label
                    key={w}
                    className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] border border-line px-3"
                  >
                    <input
                      type="checkbox"
                      checked={cfg.weekdays.includes(i)}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          weekdays: e.target.checked
                            ? [...cfg.weekdays, i].sort()
                            : cfg.weekdays.filter((x) => x !== i),
                        })
                      }
                    />
                    <span aria-hidden>{w}</span>
                    <span className="sr-only">{DAYS[i]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Button type="submit" disabled={busy}>
                Salvar configuração
              </Button>
            </div>
          </form>
        </Card>
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        <p className="text-sm text-muted">
          Controle pessoal: a frequência oficial é a registrada pela instituição. Registrar uma
          justificativa aqui não significa abono.
        </p>
        <Link href="/app/faltas" className="text-sm">
          Faltas de todas as disciplinas
        </Link>
      </aside>
    </div>
  );
}
