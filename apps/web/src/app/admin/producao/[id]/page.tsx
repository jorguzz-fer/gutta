import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { slidesLabel } from '@gutta/core';
import { AdminHeader } from '@/components/admin/ui';
import { AutoRefresh } from '@/components/production/auto-refresh';
import { SendToReviewButton } from '@/components/production/review-actions';
import { TaskBoard } from '@/components/production/task-board';
import Link from 'next/link';
import { Alert, Badge, Card } from '@/components/ui/card';
import { BATCH_STATUS, SLIDE_KIND, usd } from '@/features/production/labels';
import { getBatch } from '@/features/production/service';
import { ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Lote de produção' };

// Tela do lote (docs/producao/ESPECIFICACAO.md, telas do admin, item 2): slides lado a lado
// com as tarefas detectadas; aprovar, editar ou descartar; custo estimado antes da geração.
export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(['admin'], `/admin/producao/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getBatch(user.id, id).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const { batch, slides, tasks } = data;
  const st = BATCH_STATUS[batch.status];
  const instructions = slides.filter((x) => x.kind === 'instruction').length;
  const toReview = tasks.filter((t) => t.status === 'generated' && !t.inReview).length;
  const inReview = tasks.filter((t) => t.inReview).length;

  return (
    <div className="grid gap-6">
      <AdminHeader
        title={batch.title}
        crumbs={[{ href: '/admin/producao', label: 'Produção de aulas' }]}
        lead={`${batch.disciplineName} · ${batch.topicName} · posição ${batch.position} · ${batch.fileName}`}
        action={<Badge tone={st.tone}>{st.text}</Badge>}
      />

      {st.busy ? (
        <Alert>
          <AutoRefresh />
          {batch.status === 'planning'
            ? 'A IA está planejando as peças a partir dos slides. Uma aula inteira leva alguns minutos.'
            : batch.status === 'generating'
              ? 'As peças estão sendo escritas e testadas, uma de cada vez. Cada peça leva alguns minutos; esta tela se atualiza sozinha. Os vídeos esperam a sua aprovação do roteiro e das imagens, na tela de cada um.'
              : 'O arquivo está sendo verificado e convertido. Esta tela se atualiza sozinha.'}
        </Alert>
      ) : null}
      {batch.status === 'failed' ? (
        <Alert tone="danger">{batch.error ?? 'Não foi possível preparar este lote.'}</Alert>
      ) : null}
      {batch.warnings.length ? (
        <Alert tone="warn">
          <ul className="grid list-disc gap-1 pl-5">
            {batch.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {batch.status === 'ready' || batch.status === 'generating' || batch.status === 'generated' ? (
        <>
          <p className="text-sm text-muted">
            {batch.mode === 'content'
              ? `Esta aula não tem pedidos do professor: as ${tasks.length} tarefas são propostas da IA pelo conteúdo. A sua aprovação é o filtro de escopo.`
              : `${slides.length} slides, ${instructions} com pedidos do professor, que formam ${tasks.length} tarefas.`}{' '}
            {batch.planCostMicros ? `Custo do plano por IA: ${usd(batch.planCostMicros)}.` : ''}
          </p>
          {tasks.length ? (
            <TaskBoard
              key={tasks
                .map((t) => `${t.id}:${t.status}:${t.currentVersion}:${t.mediaStage}`)
                .join(',')}
              batchId={batch.id}
              tasks={tasks}
              slides={slides}
              estimatedCredits={batch.estimatedCredits}
              editable={batch.status !== 'generating'}
            />
          ) : (
            <Alert>Nenhuma tarefa neste lote.</Alert>
          )}
          {toReview || inReview ? (
            <Card as="section" aria-labelledby="revisao" className="grid gap-3">
              <h2 id="revisao" className="text-xl">
                Revisão médica
              </h2>
              <p className="text-sm text-muted">
                Cada peça pronta vira um módulo e as questões do plano vão junto, as duas com o selo
                de demonstração. O revisor aprova ou pede ajuste; só a peça aprovada é publicada.
                {inReview
                  ? ` ${inReview} ${inReview === 1 ? 'peça já está' : 'peças já estão'} na revisão.`
                  : ''}
              </p>
              <SendToReviewButton batchId={batch.id} count={toReview} />
              <p>
                <Link href="/admin/revisao">Abrir a fila de revisão</Link>
              </p>
            </Card>
          ) : null}
        </>
      ) : null}

      {slides.length ? (
        <Card as="section" aria-labelledby="slides" className="grid gap-3">
          <details>
            <summary className="cursor-pointer">
              <h2 id="slides" className="inline text-xl">
                Todos os slides ({slides.length})
              </h2>
            </summary>
            <ol className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
              {slides.map((x) => (
                <li key={x.number} className="grid content-start gap-1">
                  {x.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket
                    <img
                      src={x.imageUrl}
                      alt={`Slide ${x.number}`}
                      loading="lazy"
                      className="aspect-video w-full rounded-md border border-line bg-surface-2 object-contain"
                    />
                  ) : (
                    <div className="grid aspect-video place-items-center rounded-md border border-dashed border-line bg-surface-2 text-xs text-muted">
                      {x.hidden ? 'Slide oculto' : 'Sem imagem'}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="font-mono">{slidesLabel([x.number])}</span>
                    <Badge tone={x.kind === 'instruction' ? 'accent' : 'neutral'}>
                      {SLIDE_KIND[x.kind]}
                    </Badge>
                    {x.hidden ? <Badge tone="neutral">Oculto</Badge> : null}
                  </div>
                  {x.text ? (
                    <p className="line-clamp-3 text-xs whitespace-pre-line text-muted">{x.text}</p>
                  ) : null}
                  {x.notes ? (
                    <p className="line-clamp-2 text-xs text-muted">Notas: {x.notes}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
