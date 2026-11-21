import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PIECE_TYPE_LABEL } from '@gutta/core';
import { AdminHeader } from '@/components/admin/ui';
import { AutoRefresh } from '@/components/production/auto-refresh';
import { ReviewDecision } from '@/components/production/review-actions';
import { PlanSummary, type Plan } from '@/components/production/task-board';
import { Alert, Badge, Card } from '@/components/ui/card';
import { getReview } from '@/features/production/review';
import { ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Revisar peça' };

const MODULE_STATUS: Record<string, { text: string; tone: 'neutral' | 'accent' | 'success' }> = {
  in_review: { text: 'Em revisão', tone: 'accent' },
  approved: { text: 'Aprovada', tone: 'success' },
  published: { text: 'Publicada', tone: 'success' },
  draft: { text: 'Rascunho', tone: 'neutral' },
  archived: { text: 'Arquivada', tone: 'neutral' },
};

const date = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

// Revisão de uma peça (docs/producao/ESPECIFICACAO.md, telas do admin, item 4): a peça nos dois
// temas, o que a IA pediu para conferir, as questões com o gabarito e a decisão do revisor.
export default async function ReviewPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const user = await requireRole(['reviewer', 'admin'], `/admin/revisao/${taskId}`);
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) notFound();
  const data = await getReview(user.id, taskId).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const { batch, task, module, media, questions, reviews, reviewNotes, scenarios } = data;
  const st = MODULE_STATUS[module.status] ?? MODULE_STATUS.draft!;
  const version = task.currentVersion;
  const regenerating = task.status === 'generating';
  const canDecide = module.status === 'in_review' && task.status === 'generated' && version;
  const preview = (tema: 'claro' | 'escuro') =>
    `/api/v1/production/tasks/${task.id}/preview?versao=${version}&tema=${tema}`;
  const excerpts = [
    ...scenarios.map((x) => `Cenário: ${x}`),
    'Texto de abertura',
    'Para fixar',
    'Na prova',
    ...(media ? ['Narração e legenda', 'Imagens do vídeo'] : []),
    ...questions.map((_, i) => `Questão ${i + 1}`),
  ];

  return (
    <div className="grid gap-6">
      <AdminHeader
        title={task.title}
        crumbs={[{ href: '/admin/revisao', label: 'Revisão de aulas' }]}
        lead={`${batch.disciplineName} · ${batch.title} · ${task.pieceType ? PIECE_TYPE_LABEL[task.pieceType] : 'Peça'}${version ? ` · versão ${version}` : ''}`}
        action={<Badge tone={st.tone}>{st.text}</Badge>}
      />

      {regenerating ? (
        <Alert>
          <AutoRefresh everyMs={5000} />A IA está gerando a nova versão com o seu comentário. Esta
          tela se atualiza sozinha.
        </Alert>
      ) : null}
      {task.status === 'failed' && task.lastError ? (
        <Alert tone="danger">
          <p className="font-semibold">O ajuste não passou no teste depois das tentativas.</p>
          <p className="whitespace-pre-line">{task.lastError}</p>
        </Alert>
      ) : null}
      {reviewNotes.length ? (
        <Alert tone="warn">
          <p className="font-semibold">A IA pediu atenção do revisor em:</p>
          <ul className="grid list-disc gap-1 pl-5">
            {reviewNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {version ? (
        <section aria-labelledby="peca" className="grid gap-3">
          <h2 id="peca" className="text-xl">
            Peça, versão {version}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {(['claro', 'escuro'] as const).map((tema) => (
              <figure key={tema} className="grid gap-1">
                <iframe
                  src={preview(tema)}
                  title={`Peça em revisão no tema ${tema}`}
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
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="grid content-start gap-6">
          <Card as="section" aria-labelledby="questoes" className="grid gap-3">
            <h2 id="questoes" className="text-xl">
              Questões ({questions.length})
            </h2>
            {questions.length === 0 ? (
              <p className="text-sm text-muted">Esta peça não tem questões (tema não central).</p>
            ) : (
              <ol className="grid gap-5">
                {questions.map((q, i) => (
                  <li
                    key={q.id}
                    className="grid gap-2 border-t border-line pt-3 first:border-0 first:pt-0"
                  >
                    <p className="font-semibold">Questão {i + 1}</p>
                    <p className="whitespace-pre-line">{q.stem}</p>
                    <ol className="grid gap-2 text-sm">
                      {q.options.map((o, j) => (
                        <li
                          key={j}
                          className={`grid gap-0.5 rounded border p-2 ${o.correct ? 'border-success' : 'border-line'}`}
                        >
                          <span>
                            {String.fromCharCode(65 + j)}) {o.body}{' '}
                            {o.correct ? <Badge tone="success">Correta</Badge> : null}
                          </span>
                          <span className="text-muted">{o.explanation}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card as="section" aria-labelledby="historico" className="grid gap-3">
            <h2 id="historico" className="text-xl">
              Histórico da revisão
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma decisão ainda.</p>
            ) : (
              <ol className="grid gap-3">
                {reviews.map((r) => (
                  <li key={r.id} className="grid gap-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.decision === 'approved' ? 'success' : 'warn'}>
                        {r.decision === 'approved' ? 'Aprovou' : 'Pediu ajuste'}
                      </Badge>
                      <span className="text-muted">
                        {r.reviewer} · versão {r.version} · {date.format(new Date(r.createdAt))}
                      </span>
                    </span>
                    {r.excerpt ? <span className="font-medium">Trecho: {r.excerpt}</span> : null}
                    {r.comment ? <span className="whitespace-pre-line">{r.comment}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
        <div className="grid content-start gap-4">
          {canDecide ? (
            <Card as="section" aria-labelledby="decisao" className="grid gap-3">
              <h2 id="decisao" className="text-xl">
                Decisão
              </h2>
              <ReviewDecision
                taskId={task.id}
                questions={questions.map((q) => ({ id: q.id, stem: q.stem }))}
                excerpts={excerpts}
              />
            </Card>
          ) : module.status === 'approved' ? (
            <Alert tone="success">
              Peça aprovada. Ela vai para os alunos quando a aula for publicada na fila de revisão.
            </Alert>
          ) : module.status === 'published' ? (
            <Alert tone="success">Peça publicada: os alunos já veem esta aula.</Alert>
          ) : null}
          {media?.videoUrl ? (
            <Card as="section" aria-labelledby="video" className="grid gap-2">
              <h2 id="video" className="text-xl">
                Vídeo
              </h2>
              <video
                controls
                preload="metadata"
                src={media.videoUrl}
                aria-label="Vídeo da peça em revisão"
                className="w-full rounded-[var(--radius)] bg-black"
              />
            </Card>
          ) : null}
          <Card as="section" aria-labelledby="plano" className="grid gap-3">
            <h2 id="plano" className="text-xl">
              Plano da peça
            </h2>
            {task.plan ? (
              <PlanSummary plan={task.plan as Plan} />
            ) : (
              <p className="text-sm text-muted">Sem plano detalhado.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
