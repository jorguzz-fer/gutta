import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MEDIA_AUTO_STAGES,
  MEDIA_STAGE_LABEL,
  PIECE_TYPE_LABEL,
  isMediaStage,
  slidesLabel,
} from '@gutta/core';
import { AdminHeader } from '@/components/admin/ui';
import { AutoRefresh } from '@/components/production/auto-refresh';
import { MediaPanel } from '@/components/production/media-panel';
import { RegenerateForm } from '@/components/production/regenerate-form';
import { PlanSummary, type Plan } from '@/components/production/task-board';
import { Alert, Badge, Card } from '@/components/ui/card';
import { usd } from '@/features/production/labels';
import { getTask } from '@/features/production/service';
import { ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Peça da aula' };

const UUID = /^[0-9a-f-]{36}$/i;

const STATUS: Record<string, { text: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }> =
  {
    generating: { text: 'Gerando a peça', tone: 'accent' },
    generated: { text: 'Peça pronta', tone: 'success' },
    failed: { text: 'Falhou', tone: 'danger' },
    approved: { text: 'Aprovada', tone: 'success' },
    proposed: { text: 'A decidir', tone: 'neutral' },
    discarded: { text: 'Descartada', tone: 'danger' },
  };

const VIEW_LABEL: Record<string, string> = {
  claro: 'Tema claro',
  escuro: 'Tema escuro',
  celular: 'Celular',
};

// Tela da tarefa (docs/producao/ESPECIFICACAO.md, telas do admin, item 3): prévia da peça em
// iframe nos dois temas, capturas do teste de render e histórico de versões.
export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ versao?: string }>;
}) {
  const { id, taskId } = await params;
  const { versao } = await searchParams;
  const user = await requireRole(['admin'], `/admin/producao/${id}/tarefas/${taskId}`);
  if (!UUID.test(id) || !UUID.test(taskId)) notFound();
  const data = await getTask(user.id, taskId).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const { batch, task, slides, versions, media } = data;
  const stage = media && isMediaStage(media.stage) ? media.stage : null;
  // No vídeo, a tela só se atualiza sozinha nas etapas em que o worker trabalha.
  const working =
    task.status === 'generating' &&
    (!stage || stage === 'storyboard' || MEDIA_AUTO_STAGES.includes(stage));
  if (batch.id !== id) notFound();
  const shown = versions.find((v) => v.version === Number(versao)) ?? versions[0] ?? null;
  const st = STATUS[task.status] ?? STATUS.proposed!;
  const preview = (tema: 'claro' | 'escuro') =>
    `/api/v1/production/tasks/${task.id}/preview?versao=${shown?.version}&tema=${tema}`;

  return (
    <div className="grid gap-6">
      <AdminHeader
        title={task.title}
        crumbs={[
          { href: '/admin/producao', label: 'Produção de aulas' },
          { href: `/admin/producao/${batch.id}`, label: batch.title },
        ]}
        lead={`${String(task.position).padStart(2, '0')} · ${task.pieceType ? PIECE_TYPE_LABEL[task.pieceType] : 'Tipo a definir'} · ${slidesLabel(task.targetSlides)}`}
        action={
          <Badge tone={st.tone}>
            {stage && task.status === 'generating' ? MEDIA_STAGE_LABEL[stage] : st.text}
          </Badge>
        }
      />

      {working && !stage ? (
        <Alert>
          <AutoRefresh />A IA está escrevendo a peça; depois vêm o linter e o teste nos temas claro
          e escuro. Leva alguns minutos e esta tela se atualiza sozinha.
        </Alert>
      ) : working && stage ? (
        <Alert>
          <AutoRefresh everyMs={5000} />
          {MEDIA_STAGE_LABEL[stage]}. Esta tela se atualiza sozinha.
        </Alert>
      ) : null}
      {media ? <MediaPanel taskId={task.id} media={media} /> : null}
      {task.status === 'failed' && task.lastError ? (
        <Alert tone="danger">
          <p className="font-semibold">A peça não passou depois das tentativas de correção.</p>
          <p className="whitespace-pre-line">{task.lastError}</p>
        </Alert>
      ) : null}

      {shown ? (
        <section aria-labelledby="previa" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="previa" className="text-xl">
              Prévia da versão {shown.version}
            </h2>
            <p className="text-sm text-muted">
              {shown.ok
                ? 'Passou no linter e no teste nos dois temas.'
                : 'Esta versão não passou: veja os problemas no histórico.'}
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {(['claro', 'escuro'] as const).map((tema) => (
              <figure key={tema} className="grid gap-1">
                <iframe
                  src={preview(tema)}
                  title={`Peça no tema ${tema}`}
                  sandbox="allow-scripts"
                  loading="lazy"
                  className="h-[900px] w-full rounded-[var(--radius)] border border-line bg-surface"
                />
                <figcaption className="flex justify-between text-sm text-muted">
                  <span>Tema {tema}</span>
                  <a href={preview(tema)} target="_blank" rel="noopener">
                    Abrir em tela cheia
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : task.status !== 'generating' && !media ? (
        <Alert>Esta tarefa ainda não tem peça gerada.</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card as="section" aria-labelledby="versoes" className="grid content-start gap-3">
          <h2 id="versoes" className="text-xl">
            Versões
          </h2>
          {versions.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma versão ainda.</p>
          ) : (
            <ol className="grid gap-4">
              {versions.map((v) => (
                <li
                  key={v.version}
                  className="grid gap-2 border-t border-line pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/producao/${batch.id}/tarefas/${task.id}?versao=${v.version}`}
                      className="font-semibold"
                      aria-current={v.version === shown?.version ? 'true' : undefined}
                    >
                      Versão {v.version}
                    </Link>
                    <Badge tone={v.ok ? 'success' : 'danger'}>
                      {v.ok ? 'Passou' : 'Não passou'}
                    </Badge>
                    <span className="text-sm text-muted">
                      {new Date(v.createdAt).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {v.costMicros ? ` · ${usd(v.costMicros)}` : ''}
                    </span>
                  </div>
                  {v.problems.length ? (
                    <ul className="grid list-disc gap-1 pl-5 text-sm text-danger">
                      {v.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  {v.warnings.length ? (
                    <ul className="grid list-disc gap-1 pl-5 text-sm text-warn">
                      {v.warnings.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  {Object.keys(v.screenshots).length ? (
                    <div className="flex flex-wrap gap-3">
                      {['claro', 'escuro', 'celular']
                        .filter((k) => v.screenshots[k])
                        .map((k) => (
                          <a
                            key={k}
                            href={v.screenshots[k]}
                            target="_blank"
                            rel="noopener"
                            className="grid gap-1 text-xs"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket */}
                            <img
                              src={v.screenshots[k]}
                              alt={`Captura do teste, versão ${v.version}, ${VIEW_LABEL[k]?.toLowerCase()}`}
                              loading="lazy"
                              className="h-28 w-auto rounded border border-line object-cover object-top"
                            />
                            {VIEW_LABEL[k]}
                          </a>
                        ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="grid content-start gap-4">
          {task.status === 'generated' || task.status === 'failed' ? (
            <Card as="section" aria-labelledby="gerar" className="grid gap-3">
              <h2 id="gerar" className="text-xl">
                Gerar de novo
              </h2>
              <RegenerateForm taskId={task.id} hasVersion={Boolean(task.currentVersion)} />
            </Card>
          ) : null}
          <Card as="section" aria-labelledby="plano" className="grid gap-3">
            <h2 id="plano" className="text-xl">
              Plano aprovado
            </h2>
            {task.plan ? (
              <PlanSummary plan={task.plan as Plan} />
            ) : (
              <p className="text-sm text-muted">Sem plano detalhado da IA.</p>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {task.origin === 'instruction' ? 'Pedido do professor' : 'Por que a IA propôs'}
              </summary>
              <p className="mt-1 text-sm whitespace-pre-line text-muted">{task.instruction}</p>
            </details>
          </Card>
          {slides.length ? (
            <Card as="section" aria-labelledby="slides-pedido" className="grid gap-3">
              <h2 id="slides-pedido" className="text-xl">
                Slides do pedido
              </h2>
              <ul className="grid gap-3">
                {slides.map((x) => (
                  <li key={x.number} className="grid gap-1 text-sm">
                    {x.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket
                      <img
                        src={x.imageUrl}
                        alt={`Slide ${x.number}`}
                        loading="lazy"
                        className="aspect-video w-full rounded border border-line bg-surface-2 object-contain"
                      />
                    ) : null}
                    <span className="text-muted">{slidesLabel([x.number])}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
