'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { production } from '@gutta/contracts';
import {
  MEDIA_STAGE_LABEL,
  PIECE_TYPE_LABEL,
  PIECE_TYPES,
  isMediaStage,
  slidesLabel,
  type PieceType,
} from '@gutta/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';

type Task = production.TaskDto;
type Slide = production.SlideDto;

const STATUS_LABEL: Record<
  Task['status'],
  { text: string; tone: 'neutral' | 'success' | 'danger' | 'accent' | 'warn' }
> = {
  proposed: { text: 'A decidir', tone: 'neutral' },
  approved: { text: 'Aprovada', tone: 'success' },
  discarded: { text: 'Descartada', tone: 'danger' },
  generating: { text: 'Gerando a peça', tone: 'accent' },
  generated: { text: 'Peça pronta', tone: 'success' },
  failed: { text: 'Falhou', tone: 'danger' },
};

/** Ainda é decisão do admin (antes de ir para a geração). */
const decidable = (t: Task) =>
  t.status === 'proposed' || t.status === 'approved' || t.status === 'discarded';

/** Vai para a geração ao liberar: peça HTML direto; o vídeo começa pelo roteiro. */
const releasable = (t: Task) => t.status === 'approved' && t.pieceType !== null;

export type Plan = {
  lead?: string;
  interaction?: string;
  scenarios?: { id: string; label: string }[];
  fixar?: string;
  naProva?: string;
  questions?: { stem: string }[];
  media?: { kind: string; description: string }[];
  reviewNotes?: string[];
};

function SlideThumb({ slide, number }: { slide: Slide | undefined; number: number }) {
  return (
    <figure className="grid w-40 shrink-0 gap-1">
      {slide?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket, sem otimização
        <img
          src={slide.imageUrl}
          alt={`Slide ${number}`}
          className="aspect-video w-full rounded-md border border-line bg-surface-2 object-contain"
          loading="lazy"
        />
      ) : (
        <div className="grid aspect-video place-items-center rounded-md border border-dashed border-line bg-surface-2 p-2 text-center text-xs text-muted">
          {slide?.hidden ? 'Slide oculto' : 'Sem imagem'}
        </div>
      )}
      <figcaption className="text-xs text-muted">Slide {number}</figcaption>
    </figure>
  );
}

export function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <dl className="grid gap-2 text-sm">
      {plan.lead ? (
        <div>
          <dt className="font-semibold">O que o aluno faz</dt>
          <dd className="text-muted">{plan.lead}</dd>
        </div>
      ) : null}
      {plan.interaction ? (
        <div>
          <dt className="font-semibold">Área interativa</dt>
          <dd className="text-muted">{plan.interaction}</dd>
        </div>
      ) : null}
      {plan.scenarios?.length ? (
        <div>
          <dt className="font-semibold">Cenários</dt>
          <dd className="text-muted">{plan.scenarios.map((x) => x.label).join(' · ')}</dd>
        </div>
      ) : null}
      {plan.fixar ? (
        <div>
          <dt className="font-semibold">Para fixar</dt>
          <dd className="text-muted">{plan.fixar}</dd>
        </div>
      ) : null}
      {plan.naProva ? (
        <div>
          <dt className="font-semibold">Na prova</dt>
          <dd className="text-muted">{plan.naProva}</dd>
        </div>
      ) : null}
      {plan.questions?.length ? (
        <div>
          <dt className="font-semibold">Questões ({plan.questions.length})</dt>
          <dd>
            <ol className="list-decimal pl-5 text-muted">
              {plan.questions.map((q, i) => (
                <li key={i}>{q.stem}</li>
              ))}
            </ol>
          </dd>
        </div>
      ) : null}
      {plan.media?.length ? (
        <div>
          <dt className="font-semibold">Mídia gerada</dt>
          <dd className="text-muted">
            {plan.media.map((m) => `${m.kind}: ${m.description}`).join(' · ')}
          </dd>
        </div>
      ) : null}
      {plan.reviewNotes?.length ? (
        <div>
          <dt className="font-semibold">Para o revisor conferir</dt>
          <dd>
            <ul className="list-disc pl-5 text-muted">
              {plan.reviewNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function TaskCard({
  task,
  slides,
  editable,
  batchId,
  onChange,
}: {
  task: Task;
  slides: Map<number, Slide>;
  editable: boolean;
  batchId: string;
  onChange: (task: Task, credits: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS_LABEL[task.status];
  // Vídeo em produção: a etapa da mídia diz o que espera (roteiro ou imagens para aprovar).
  const stage =
    task.status === 'generating' && task.mediaStage && isMediaStage(task.mediaStage)
      ? task.mediaStage
      : null;
  const titleId = `tarefa-${task.id}`;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ task: Task; estimatedCredits: number }>(
        `/production/tasks/${task.id}`,
        { method: 'PATCH', body },
      );
      onChange(r.task, r.estimatedCredits);
      return true;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pieceType = String(f.get('pieceType') ?? '');
    const ok = await patch({
      title: String(f.get('title') ?? ''),
      pieceType: pieceType ? (pieceType as PieceType) : null,
    });
    if (ok) setEditing(false);
  }

  return (
    <Card
      as="article"
      aria-labelledby={titleId}
      className={`grid gap-3 ${task.status === 'discarded' ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <p className="font-mono text-sm text-muted">
            {String(task.position).padStart(2, '0')} ·{' '}
            {task.origin === 'instruction'
              ? `Pedido ${task.sourceSlides.length > 1 ? 'nos' : 'no'} ${slidesLabel(task.sourceSlides).toLowerCase()}`
              : 'Proposta da IA'}
          </p>
          <h3 id={titleId} className="text-lg font-semibold">
            {task.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {task.priority ? <Badge tone="accent">Prioridade do professor</Badge> : null}
          <Badge tone="neutral">
            {task.pieceType ? PIECE_TYPE_LABEL[task.pieceType] : 'Tipo a definir'}
          </Badge>
          <Badge tone={stage === 'paused' ? 'danger' : status.tone}>
            {stage ? MEDIA_STAGE_LABEL[stage] : status.text}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
        <div className="grid content-start gap-1">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {task.targetSlides.map((n) => (
              <SlideThumb key={n} slide={slides.get(n)} number={n} />
            ))}
          </div>
          {task.targetAssumed ? (
            <p className="max-w-80 text-xs text-warn">
              O pedido não diz o slide: presumimos o anterior. Confira.
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              {task.origin === 'instruction' ? 'Pedido do professor' : 'Por que a IA propôs'}
            </summary>
            <p className="mt-1 text-sm whitespace-pre-line text-muted">{task.instruction}</p>
          </details>
          {task.plan ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Plano da peça</summary>
              <div className="mt-2">
                <PlanSummary plan={task.plan as Plan} />
              </div>
            </details>
          ) : (
            <p className="text-sm text-muted">Sem plano da IA: defina o tipo de peça.</p>
          )}
          {task.credits ? (
            <p className="text-sm text-muted">Mídia estimada: {task.credits} créditos.</p>
          ) : null}
          {task.status === 'approved' && task.pieceType === 'video' ? (
            <p className="text-sm text-muted">
              O vídeo começa pelo roteiro; imagens e clipes só depois das suas aprovações.
            </p>
          ) : null}
          {task.status === 'failed' && task.lastError ? (
            <p className="text-sm whitespace-pre-line text-danger">{task.lastError}</p>
          ) : null}
          {task.currentVersion || !decidable(task) ? (
            <p>
              <Link
                href={`/admin/producao/${batchId}/tarefas/${task.id}`}
                className="font-semibold"
              >
                {task.status === 'generating' && !task.currentVersion
                  ? 'Acompanhar a geração'
                  : 'Abrir a peça'}
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
          <Field label="Título">
            {(p) => <Input {...p} name="title" defaultValue={task.title} required minLength={3} />}
          </Field>
          <Field label="Tipo de peça">
            {(p) => (
              <Select {...p} name="pieceType" defaultValue={task.pieceType ?? ''}>
                <option value="">A definir</option>
                {PIECE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PIECE_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Salvar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : editable && decidable(task) ? (
        <div className="flex flex-wrap gap-2">
          {task.status !== 'approved' ? (
            <Button
              type="button"
              disabled={busy || !task.pieceType}
              title={task.pieceType ? undefined : 'Defina o tipo de peça antes de aprovar.'}
              onClick={() => patch({ status: 'approved' })}
            >
              Aprovar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
          {task.status !== 'discarded' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => patch({ status: 'discarded' })}
            >
              Descartar
            </Button>
          ) : null}
          {task.status !== 'proposed' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => patch({ status: 'proposed' })}
            >
              Desfazer decisão
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Card>
  );
}

/** Etapa 4: o admin aprova, edita ou descarta cada tarefa e vê o custo estimado mudar. */
export function TaskBoard({
  batchId,
  tasks: initial,
  slides,
  estimatedCredits: initialCredits,
  editable,
}: {
  batchId: string;
  tasks: Task[];
  slides: Slide[];
  estimatedCredits: number;
  editable: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [credits, setCredits] = useState(initialCredits);
  const [releasing, setReleasing] = useState(false);
  const [releaseMsg, setReleaseMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toRelease = tasks.filter(releasable).length;

  async function release() {
    setReleasing(true);
    setReleaseMsg(null);
    try {
      const r = await api<{ released: number }>(`/production/batches/${batchId}/generate`, {
        method: 'POST',
      });
      setReleaseMsg({
        ok: true,
        text:
          r.released === 1
            ? '1 peça foi para a geração.'
            : `${r.released} peças foram para a geração.`,
      });
      router.refresh();
    } catch (err) {
      setReleaseMsg({
        ok: false,
        text: err instanceof ClientApiError ? err.message : 'Não deu para liberar agora.',
      });
    } finally {
      setReleasing(false);
    }
  }
  const bySlide = new Map(slides.map((x) => [x.number, x]));
  const count = (st: Task['status']) => tasks.filter((t) => t.status === st).length;

  return (
    <div className="grid gap-4">
      <Card as="section" aria-labelledby="resumo-lote" className="grid gap-3">
        <h2 id="resumo-lote" className="text-xl">
          Decisão do plano
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted">Tarefas</dt>
            <dd className="text-2xl font-bold">{tasks.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Aprovadas</dt>
            <dd className="text-2xl font-bold">{count('approved')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Descartadas</dt>
            <dd className="text-2xl font-bold">{count('discarded')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Mídia estimada</dt>
            <dd className="text-2xl font-bold" aria-live="polite">
              {credits} créditos
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted">
          A estimativa conta as tarefas não descartadas, pela tabela do piloto (vídeo com narração ≈
          100 créditos; peças só em HTML não usam mídia gerada).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!editable || releasing || toRelease === 0}
            onClick={release}
          >
            {releasing ? 'Liberando…' : 'Liberar geração'}
          </Button>
          <span className="text-sm text-muted">
            {toRelease === 0
              ? 'Aprove as tarefas que devem virar peça.'
              : toRelease === 1
                ? '1 peça aprovada vai para a geração.'
                : `${toRelease} peças aprovadas vão para a geração.`}{' '}
            A IA escreve cada peça, que passa pelo linter e pelo teste nos temas claro e escuro.
          </span>
        </div>
        {releaseMsg ? (
          <Alert tone={releaseMsg.ok ? 'success' : 'danger'}>{releaseMsg.text}</Alert>
        ) : null}
      </Card>
      <ol className="grid gap-4" aria-label="Tarefas do lote">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskCard
              task={t}
              slides={bySlide}
              editable={editable}
              batchId={batchId}
              onChange={(task, c) => {
                setTasks((all) => all.map((x) => (x.id === task.id ? task : x)));
                setCredits(c);
              }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
