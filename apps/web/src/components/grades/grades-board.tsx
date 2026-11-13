'use client';
import { formatGrade, neededGrade } from '@gutta/core';
import { useState } from 'react';
import type { grades } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';

type Dto = grades.GradesDto;
type Assessment = Dto['assessments'][number];

const KIND = { prova: 'Prova', atividade: 'Atividade', entrega: 'Trabalho ou entrega' } as const;
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const fmtDay = (d: string | null) => (d ? DAY.format(new Date(`${d}T12:00:00Z`)) : 'sem data');
const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Simulador começando pelos números da disciplina (mínima como média desejada). */
function simFrom(d: Dto) {
  const c = (n: number) => String(n).replace('.', ',');
  return {
    current: c(d.summary.current ?? 0),
    done: c(d.summary.doneShare),
    remaining: c(d.summary.remainingShare || 1),
    desired: c(d.scheme.minGrade),
  };
}

/** Situação sem a definição de "em risco" (pendente D13): só o que a SPEC já define. */
function situation(d: Dto): { text: string; tone: 'success' | 'warn' | 'neutral' } {
  const min = formatGrade(d.scheme.minGrade);
  if (d.summary.current === null) return { text: 'Nenhuma nota lançada ainda.', tone: 'neutral' };
  if (d.needed.status === 'sem_restantes')
    return d.summary.current >= d.scheme.minGrade
      ? {
          text: `Média ${formatGrade(d.summary.current)}, acima da mínima de ${min}.`,
          tone: 'success',
        }
      : {
          text: `Média ${formatGrade(d.summary.current)}, abaixo da mínima de ${min}.`,
          tone: 'warn',
        };
  if (d.needed.status === 'garantida')
    return { text: `A média mínima de ${min} já está garantida.`, tone: 'success' };
  if (d.needed.status === 'inalcancavel')
    return {
      text: `Com as avaliações restantes, a média de ${min} não é mais alcançável. Vale conferir as regras de recuperação da disciplina.`,
      tone: 'warn',
    };
  return {
    text: `Para chegar a ${min}, você precisa de ${formatGrade(d.needed.needed!)} em média nas avaliações restantes.`,
    tone: 'neutral',
  };
}

function Chart({ d }: { d: Dto }) {
  const graded = d.assessments.filter((a) => a.grade !== null);
  if (graded.length < 2) return null;
  const W = 320;
  const H = 160;
  const pad = 24;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (graded.length - 1);
  const y = (g: number) => H - pad - (g / 10) * (H - 2 * pad);
  const points = graded.map((a, i) => `${x(i)},${y((a.grade! / a.maxGrade) * 10)}`).join(' ');
  const label = `Notas em ordem: ${graded.map((a) => `${a.name} ${formatGrade((a.grade! / a.maxGrade) * 10)}`).join(', ')}. Média mínima ${formatGrade(d.scheme.minGrade)}.`;
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full max-w-xl">
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line
              x1={pad}
              x2={W - pad}
              y1={y(g)}
              y2={y(g)}
              className="stroke-line"
              strokeWidth={1}
            />
            <text x={4} y={y(g) + 4} className="fill-muted text-[10px]">
              {g}
            </text>
          </g>
        ))}
        <line
          x1={pad}
          x2={W - pad}
          y1={y(d.scheme.minGrade)}
          y2={y(d.scheme.minGrade)}
          className="stroke-warn"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <polyline points={points} fill="none" className="stroke-accent" strokeWidth={2} />
        {graded.map((a, i) => (
          <circle
            key={a.id}
            cx={x(i)}
            cy={y((a.grade! / a.maxGrade) * 10)}
            r={4}
            className="fill-accent"
          />
        ))}
      </svg>
      <figcaption className="text-sm text-muted">
        Notas por avaliação, em ordem; a linha tracejada é a média mínima. O gráfico mostra notas
        individuais, não a média.
      </figcaption>
    </figure>
  );
}

/*
  Notas da disciplina (SPEC v2, NOT; telas T22 e T23). A média considera só o que foi lançado.
  Nota lançada aqui é o seu acompanhamento, nunca o registro oficial (NOT-19).
*/
export function GradesBoard({ initial }: { initial: Dto }) {
  const [d, setD] = useState(initial);
  const [method, setMethod] = useState(initial.scheme.method);
  const [minGrade, setMinGrade] = useState(String(initial.scheme.minGrade).replace('.', ','));
  const [editing, setEditing] = useState<Record<string, { grade: string; share: string }>>({});
  const [newA, setNewA] = useState({
    name: '',
    kind: 'prova' as Assessment['kind'],
    date: '',
    grade: '',
    share: '1',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Simulador (NOT-11), começando pelos números da disciplina.
  const [sim, setSim] = useState(() => simFrom(initial));

  const base = `/disciplines/${d.disciplineId}`;
  const shareLabel = d.scheme.method === 'percentual' ? 'Porcentagem' : 'Peso';

  async function run(fn: () => Promise<{ grades: Dto }>) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      setD(res.grades);
      setSim(simFrom(res.grades));
      return true;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const gradeBody = (a: Assessment, grade: number | null, share: number | null) => ({
    grade,
    maxGrade: a.maxGrade,
    weight: d.scheme.method === 'percentual' ? a.weight : share,
    percent: d.scheme.method === 'percentual' ? share : a.percent,
  });

  async function saveRow(a: Assessment) {
    const e = editing[a.id];
    if (!e) return;
    const ok = await run(() =>
      api(`/assessments/${a.id}/grade`, {
        method: 'PUT',
        body: gradeBody(a, parse(e.grade), parse(e.share)),
      }),
    );
    if (ok) setEditing(({ [a.id]: _, ...rest }) => rest);
  }

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { assessment } = await api<{ assessment: { id: string } }>('/assessments', {
        method: 'POST',
        body: {
          disciplineId: d.disciplineId,
          kind: newA.kind,
          name: newA.name,
          topicNote: null,
          date: newA.date,
          start: null,
        },
      });
      const share = parse(newA.share);
      const res = await api<{ grades: Dto }>(`/assessments/${assessment.id}/grade`, {
        method: 'PUT',
        body: {
          grade: parse(newA.grade),
          maxGrade: 10,
          weight: d.scheme.method === 'percentual' ? null : share,
          percent: d.scheme.method === 'percentual' ? share : null,
        },
      });
      setD(res.grades);
      setSim(simFrom(res.grades));
      setNewA({ name: '', kind: 'prova', date: '', grade: '', share: '1' });
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    } finally {
      setBusy(false);
    }
  }

  const st = situation(d);
  const simResult = neededGrade({
    currentAverage: parse(sim.current) ?? 0,
    doneShare: parse(sim.done) ?? 0,
    remainingShare: parse(sim.remaining) ?? 0,
    desired: parse(sim.desired) ?? 0,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid min-w-0 content-start gap-6">
        <Card as="section" aria-labelledby="desempenho" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="desempenho" className="text-lg font-semibold">
              Meu desempenho
            </h2>
            <Badge tone="neutral">Acompanhamento pessoal</Badge>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-sm text-muted">Média atual</dt>
              <dd className="text-2xl font-bold">
                {d.summary.current === null ? '—' : formatGrade(d.summary.current)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Média mínima</dt>
              <dd className="text-2xl font-bold">{formatGrade(d.scheme.minGrade)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Avaliações lançadas</dt>
              <dd className="text-2xl font-bold">
                {d.summary.graded} de {d.summary.graded + d.summary.pending}
              </dd>
            </div>
          </dl>
          <p className={st.tone === 'warn' ? 'text-warn' : undefined}>{st.text}</p>
          <p className="text-sm text-muted">
            A média atual considera só as notas já lançadas; avaliação sem nota fica pendente, não
            vale zero.
          </p>
          {d.summary.percentTotal !== null && d.summary.percentTotal !== 100 ? (
            <Alert tone="warn">
              As porcentagens somam {formatGrade(d.summary.percentTotal)}%; para a média final, a
              soma precisa ser 100%.
            </Alert>
          ) : null}
          <Chart d={d} />
        </Card>

        <Card as="section" aria-labelledby="avaliacoes" className="grid gap-3">
          <h2 id="avaliacoes" className="text-lg font-semibold">
            Avaliações
          </h2>
          {d.assessments.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma avaliação cadastrada.</p>
          ) : (
            <ul className="grid gap-2">
              {d.assessments.map((a) => {
                const e = editing[a.id];
                const share = d.scheme.method === 'percentual' ? a.percent : a.weight;
                return (
                  <li
                    key={a.id}
                    className="grid gap-2 rounded-[var(--radius)] border border-line p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-sm text-muted">
                          {KIND[a.kind]} · {fmtDay(a.date)}
                          {d.scheme.method !== 'simples'
                            ? ` · ${shareLabel} ${share === null ? (d.scheme.method === 'pesos' ? 1 : 0) : formatGrade(share)}${d.scheme.method === 'percentual' ? '%' : ''}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold">
                          {a.grade === null ? 'Pendente' : formatGrade(a.grade)}
                        </span>
                        {!e ? (
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Lançar ou editar nota de ${a.name}`}
                            onClick={() =>
                              setEditing({
                                ...editing,
                                [a.id]: {
                                  grade: a.grade === null ? '' : String(a.grade).replace('.', ','),
                                  share: String(share ?? (d.scheme.method === 'pesos' ? 1 : '')),
                                },
                              })
                            }
                          >
                            Editar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {e ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <Field
                          label={`Nota de ${a.name} (0 a ${formatGrade(a.maxGrade)})`}
                          hint="Vazio: pendente."
                        >
                          {(p) => (
                            <Input
                              {...p}
                              inputMode="decimal"
                              value={e.grade}
                              onChange={(ev) =>
                                setEditing({ ...editing, [a.id]: { ...e, grade: ev.target.value } })
                              }
                            />
                          )}
                        </Field>
                        {d.scheme.method !== 'simples' ? (
                          <Field label={`${shareLabel} de ${a.name}`}>
                            {(p) => (
                              <Input
                                {...p}
                                inputMode="decimal"
                                value={e.share}
                                onChange={(ev) =>
                                  setEditing({
                                    ...editing,
                                    [a.id]: { ...e, share: ev.target.value },
                                  })
                                }
                              />
                            )}
                          </Field>
                        ) : (
                          <span />
                        )}
                        <Button type="button" disabled={busy} onClick={() => saveRow(a)}>
                          Salvar nota
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={add} className="grid gap-3 border-t border-line pt-3">
            <h3 className="font-semibold">Cadastrar avaliação</h3>
            <Field label="Nome da atividade ou prova">
              {(p) => (
                <Input
                  {...p}
                  required
                  maxLength={200}
                  value={newA.name}
                  onChange={(e) => setNewA({ ...newA, name: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                {(p) => (
                  <Select
                    {...p}
                    value={newA.kind}
                    onChange={(e) =>
                      setNewA({ ...newA, kind: e.target.value as Assessment['kind'] })
                    }
                  >
                    {Object.entries(KIND).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Data">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    required
                    value={newA.date}
                    onChange={(e) => setNewA({ ...newA, date: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Nota (0 a 10)" optional hint="Vazio: pendente.">
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    value={newA.grade}
                    onChange={(e) => setNewA({ ...newA, grade: e.target.value })}
                  />
                )}
              </Field>
              {d.scheme.method !== 'simples' ? (
                <Field label={shareLabel}>
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="decimal"
                      required
                      value={newA.share}
                      onChange={(e) => setNewA({ ...newA, share: e.target.value })}
                    />
                  )}
                </Field>
              ) : null}
            </div>
            <div>
              <Button type="submit" disabled={busy}>
                Adicionar avaliação
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <aside className="grid content-start gap-4">
        <Card as="section" aria-labelledby="calculo" className="grid gap-3">
          <h2 id="calculo" className="text-lg font-semibold">
            Configuração do cálculo
          </h2>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                api(`${base}/grades/scheme`, {
                  method: 'PUT',
                  body: { method, minGrade: parse(minGrade) ?? 7 },
                }),
              );
            }}
          >
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium">Fórmula da média</legend>
              {(
                [
                  ['simples', 'Média aritmética simples'],
                  ['pesos', 'Média ponderada por pesos'],
                  ['percentual', 'Composição por porcentagem'],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="method"
                    className="size-5"
                    checked={method === v}
                    onChange={() => setMethod(v)}
                  />
                  {l}
                </label>
              ))}
            </fieldset>
            <Field label="Média mínima de aprovação">
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={minGrade}
                  onChange={(e) => setMinGrade(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                Salvar configuração
              </Button>
            </div>
          </form>
        </Card>

        <Card as="section" aria-labelledby="simulador" className="grid gap-3">
          <h2 id="simulador" className="text-lg font-semibold">
            Quanto preciso tirar?
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['current', 'Média das avaliações realizadas'],
                ['desired', 'Média final desejada'],
                [
                  'done',
                  d.scheme.method === 'percentual'
                    ? 'Porcentagem já realizada'
                    : 'Peso já realizado',
                ],
                [
                  'remaining',
                  d.scheme.method === 'percentual' ? 'Porcentagem restante' : 'Peso restante',
                ],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    value={sim[k]}
                    onChange={(e) => setSim({ ...sim, [k]: e.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
          <div
            className="grid gap-1 rounded-[var(--radius)] bg-surface-2 p-3 text-center"
            aria-live="polite"
          >
            {simResult.status === 'sem_restantes' ? (
              <p>Informe um peso restante maior que zero.</p>
            ) : (
              <>
                <p className="text-sm">Nota necessária nas próximas avaliações</p>
                <p className="text-3xl font-bold">{formatGrade(simResult.needed)}</p>
                <p className="text-sm text-muted">
                  {simResult.status === 'garantida'
                    ? 'A média desejada já está garantida.'
                    : simResult.status === 'inalcancavel'
                      ? 'Passa da nota máxima de 10: a média desejada não é alcançável com o que falta.'
                      : 'Considerando os pesos informados e nota máxima de 10.'}
                </p>
              </>
            )}
          </div>
        </Card>
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        <p className="text-sm text-muted">
          As notas lançadas aqui são o seu acompanhamento. O registro oficial é o da instituição.
        </p>
      </aside>
    </div>
  );
}
