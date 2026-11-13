'use client';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  diffSchedule,
  normalizeScheduleItem,
  scheduleItemErrors,
  type ScheduleField,
  type ScheduleItem,
  type ScheduleItemError,
} from '@gutta/core';
import type { schedule } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Dto = schedule.ScheduleImportDto;
type Row = ScheduleItem & {
  key: string;
  include: boolean;
  confidence: 'alta' | 'media' | 'baixa' | null;
  source: string | null;
  note: string | null;
};
type Result = { added: number; changed: number; removed: number; kept: number };

const TYPE_LABEL: Record<ScheduleItem['type'], string> = {
  aula: 'Aula',
  pratica: 'Prática',
  prova: 'Prova',
  atividade: 'Atividade',
  entrega: 'Entrega',
  outro: 'Outro (feriado, recesso, evento)',
};
const FIELD_LABEL: Record<ScheduleField, string> = {
  date: 'data',
  start: 'início',
  end: 'fim',
  type: 'tipo',
  title: 'título',
  topic: 'tema',
  teacher: 'docente',
  location: 'local',
};
const ERROR_TEXT: Record<ScheduleItemError, string> = {
  date: 'Informe uma data válida.',
  start: 'Hora de início no formato HH:MM.',
  end: 'Hora de fim no formato HH:MM.',
  end_before_start: 'O fim precisa ser depois do início.',
  end_without_start: 'Informe o início antes do fim.',
  title: 'Informe o título.',
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const fmtDay = (d: string) => {
  const t = Date.parse(`${d}T12:00:00Z`);
  return Number.isNaN(t) ? d : dateFmt.format(t);
};
const keyOf = (i: ScheduleItem) => JSON.stringify(normalizeScheduleItem(i));
const pickItem = (r: Row): ScheduleItem => ({
  date: r.date,
  start: r.start || null,
  end: r.end || null,
  type: r.type,
  title: r.title,
  topic: r.topic || null,
  teacher: r.teacher || null,
  location: r.location || null,
});

/*
  Conferência do cronograma (SPEC v2, DIS-05 e DIS-07). Cada item lido pela IA pode ser
  corrigido ou deixado de fora; os de baixa confiança vêm destacados com o trecho de origem.
  Quando já existe cronograma confirmado, cada item mostra se é novo ou o que mudou, e a
  lista do que sai da agenda aparece antes de confirmar. Evento que o aluno editou fica.
*/
export function ScheduleReview({
  initial,
  backHref = '/app/minhas-disciplinas',
  backLabel = 'Voltar para Minhas disciplinas',
}: {
  initial: Dto;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const [dto, setDto] = useState(initial);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.items ?? []).map((i, n) => ({ ...i, key: `ia-${n}`, include: true })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  // Leitura em andamento: atualiza a página até ficar pronta.
  const reading = dto.status === 'waiting_file' || dto.status === 'extracting';
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(async () => {
      try {
        const res = await api<{ import: Dto }>(`/schedule-imports/${dto.id}`);
        if (res.import.status !== dto.status) {
          setDto(res.import);
          setRows(
            (res.import.items ?? []).map((i, n) => ({ ...i, key: `ia-${n}`, include: true })),
          );
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => clearInterval(t);
  }, [reading, dto.id, dto.status]);

  const included = useMemo(() => rows.filter((r) => r.include), [rows]);
  const errors = useMemo(
    () => new Map(rows.map((r) => [r.key, r.include ? scheduleItemErrors(pickItem(r)) : []])),
    [rows],
  );
  const hasErrors = [...errors.values()].some((e) => e.length > 0);
  const diff = useMemo(
    () => diffSchedule(dto.existing, included.map(pickItem)),
    [dto.existing, included],
  );
  const statusByKey = useMemo(() => {
    const m = new Map<string, { label: string; tone: 'accent' | 'warn' | 'neutral' }>();
    for (const a of diff.added) m.set(keyOf(a), { label: 'Novo', tone: 'accent' });
    for (const c of diff.changed)
      m.set(
        keyOf(c.next),
        c.keepStudent
          ? { label: 'Você editou: fica a sua versão', tone: 'warn' }
          : {
              label: `Muda: ${c.fields.map((f) => FIELD_LABEL[f]).join(', ')}`,
              tone: 'warn',
            },
      );
    for (const u of diff.unchanged) m.set(keyOf(u.next), { label: 'Sem mudança', tone: 'neutral' });
    return m;
  }, [diff]);
  const leaving = diff.removed.filter((r) => !r.keepStudent);
  const staying = diff.removed.filter((r) => r.keepStudent);
  const hasPrevious = dto.existing.length > 0;

  const update = (key: string, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((cur) => [
      ...cur,
      {
        key: `manual-${Date.now()}`,
        include: true,
        date: cur.at(-1)?.date ?? `${dto.referenceYear}-01-01`,
        start: null,
        end: null,
        type: 'aula',
        title: '',
        topic: null,
        teacher: null,
        location: null,
        confidence: null,
        source: null,
        note: null,
      },
    ]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ import: Dto; result: Result }>(
        `/schedule-imports/${dto.id}/confirm`,
        { method: 'POST', body: { items: included.map(pickItem) } },
      );
      setDto(res.import);
      setResult(res.result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    setError('');
    try {
      await api(`/schedule-imports/${dto.id}/reject`, { method: 'POST' });
      router.push(backHref);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Algo deu errado.');
      setBusy(false);
    }
  }

  const back = (
    <Link href={backHref} className="text-sm">
      {backLabel}
    </Link>
  );

  if (dto.status === 'confirmed') {
    return (
      <div className="grid gap-4">
        <Alert tone="success">
          {result ? (
            <>
              Pronto. {plural(result.added, 'item incluído', 'itens incluídos')},{' '}
              {plural(result.changed, 'alterado', 'alterados')} e{' '}
              {plural(result.removed, 'removido', 'removidos')} na agenda.
              {result.kept
                ? ` ${plural(result.kept, 'evento que você editou ficou', 'eventos que você editou ficaram')} como estava.`
                : ''}
            </>
          ) : (
            'Este cronograma já foi conferido e está na agenda.'
          )}
        </Alert>
        {back}
      </div>
    );
  }
  if (dto.status !== 'ready') {
    const text: Record<string, string> = {
      waiting_file: 'O arquivo ainda está sendo preparado. A leitura começa em seguida.',
      extracting: 'Lendo o cronograma. Isso costuma levar menos de um minuto.',
      needs_consent: 'A leitura precisa da sua autorização. Autorize no cartão da disciplina.',
      rejected: 'Esta leitura foi descartada. Nada mudou na agenda.',
      failed: dto.error ?? 'Não foi possível ler o cronograma.',
    };
    return (
      <div className="grid gap-4">
        <Alert tone={dto.status === 'failed' ? 'danger' : 'neutral'} aria-live="polite">
          {text[dto.status]}
        </Alert>
        {back}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {dto.warnings.length ? (
        <Alert tone="warn">
          <p className="font-semibold">Pontos de atenção na leitura</p>
          <ul className="list-disc pl-5">
            {dto.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {rows.length === 0 ? (
        <Alert>
          Não encontramos datas neste arquivo. Você pode adicionar os itens à mão abaixo ou
          descartar a leitura.
        </Alert>
      ) : null}

      <ol className="grid gap-3" aria-label="Itens do cronograma">
        {rows.map((r, n) => {
          const status = r.include ? statusByKey.get(keyOf(pickItem(r))) : undefined;
          const errs = errors.get(r.key) ?? [];
          const low = r.confidence === 'baixa';
          return (
            <Card
              as="li"
              key={r.key}
              className={cn(
                'grid gap-3 p-4',
                low && r.include && 'border-warn',
                !r.include && 'opacity-60',
              )}
              aria-label={`Item ${n + 1}: ${r.title || 'sem título'}, ${fmtDay(r.date)}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={r.include}
                    onChange={(e) => update(r.key, { include: e.target.checked })}
                  />
                  Levar para a agenda
                </label>
                {low ? <Badge tone="warn">Confira com atenção</Badge> : null}
                {status && hasPrevious ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                <span className="ml-auto text-sm text-muted">{fmtDay(r.date)}</span>
              </div>
              {r.note && r.include ? <p className="text-sm text-warn">{r.note}</p> : null}
              <fieldset disabled={!r.include} className="grid gap-3 sm:grid-cols-4">
                <legend className="sr-only">Dados do item {n + 1}</legend>
                <Field label="Data">
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={r.date}
                      onChange={(e) => update(r.key, { date: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Início" optional>
                  {(p) => (
                    <Input
                      {...p}
                      type="time"
                      value={r.start ?? ''}
                      onChange={(e) => update(r.key, { start: e.target.value || null })}
                    />
                  )}
                </Field>
                <Field label="Fim" optional>
                  {(p) => (
                    <Input
                      {...p}
                      type="time"
                      value={r.end ?? ''}
                      onChange={(e) => update(r.key, { end: e.target.value || null })}
                    />
                  )}
                </Field>
                <Field label="Tipo">
                  {(p) => (
                    <Select
                      {...p}
                      value={r.type}
                      onChange={(e) => update(r.key, { type: e.target.value as Row['type'] })}
                    >
                      {Object.entries(TYPE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Título">
                    {(p) => (
                      <Input
                        {...p}
                        value={r.title}
                        maxLength={200}
                        onChange={(e) => update(r.key, { title: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Tema" optional>
                    {(p) => (
                      <Input
                        {...p}
                        value={r.topic ?? ''}
                        maxLength={200}
                        onChange={(e) => update(r.key, { topic: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Docente" optional>
                    {(p) => (
                      <Input
                        {...p}
                        value={r.teacher ?? ''}
                        maxLength={120}
                        onChange={(e) => update(r.key, { teacher: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Local" optional>
                    {(p) => (
                      <Input
                        {...p}
                        value={r.location ?? ''}
                        maxLength={120}
                        onChange={(e) => update(r.key, { location: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
              {errs.length ? (
                <ul className="text-[13px] font-medium text-danger" role="alert">
                  {errs.map((e) => (
                    <li key={e}>{ERROR_TEXT[e]}</li>
                  ))}
                </ul>
              ) : null}
              {r.source ? (
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer">De onde saiu</summary>
                  <p className="mt-1 whitespace-pre-wrap">{r.source}</p>
                </details>
              ) : null}
              {r.key.startsWith('manual-') ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 className="size-4" aria-hidden /> Tirar este item
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </ol>
      <div>
        <Button type="button" variant="secondary" onClick={addRow}>
          <Plus className="size-4" aria-hidden /> Adicionar item
        </Button>
      </div>

      {leaving.length || staying.length ? (
        <Card as="section" aria-labelledby="saem" className="grid gap-2">
          <h2 id="saem" className="text-lg font-semibold">
            Não estão neste cronograma
          </h2>
          {leaving.length ? (
            <>
              <p className="text-sm">Ao confirmar, saem da agenda:</p>
              <ul className="list-disc pl-5 text-sm">
                {leaving.map(({ event }) => (
                  <li key={event.id}>
                    {fmtDay(event.original.date)} · {event.original.title}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {staying.length ? (
            <>
              <p className="text-sm">Você editou estes; eles ficam como estão:</p>
              <ul className="list-disc pl-5 text-sm">
                {staying.map(({ event }) => (
                  <li key={event.id}>
                    {fmtDay(event.original.date)} · {event.original.title}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {hasErrors ? (
        <p className="text-sm text-danger">Corrija os itens destacados para confirmar.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || hasErrors} onClick={confirm}>
          Confirmar e levar para a agenda ({included.length})
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
          Descartar esta leitura
        </Button>
        <span className="ml-auto">{back}</span>
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
