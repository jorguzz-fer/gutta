import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { QuestionForm } from '@/components/editorial/question-form';
import { TransitionButtons } from '@/components/editorial/transition-buttons';
import { Alert, Badge, Card, DemoBadge } from '@/components/ui/card';
import { editorialTopics, getQuestion, STATUS_LABEL } from '@/features/editorial/service';
import { ApiError } from '@/lib/api';
import { EDITORIAL_ROLES, requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Questão · Editorial' };

export default async function QuestionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { id } = await params;
  const { salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireRole(EDITORIAL_ROLES, `/admin/questoes/${id}`);
  const q = await getQuestion(user, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const isReviewer = user.roles.includes('reviewer') || user.roles.includes('admin');
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  const editable = q.status === 'draft';
  const topics = editable ? await editorialTopics(user) : [];

  return (
    <div className="grid max-w-3xl gap-5">
      <Link href={`/admin/questoes?status=${q.status}`} className="text-sm">
        ← Questões
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Questão v{q.version}</h1>
        <Badge
          tone={
            q.status === 'published' ? 'success' : q.status === 'in_review' ? 'warn' : 'neutral'
          }
        >
          {STATUS_LABEL[q.status]}
        </Badge>
        {q.isDemo ? <DemoBadge /> : null}
      </div>
      <p className="text-sm text-muted">
        {q.disciplineName} · {q.topicName}
        {q.publishedAt ? ` · publicada em ${fmt.format(q.publishedAt)}` : ''}
      </p>
      {salvo ? <Alert tone="success">Rascunho salvo.</Alert> : null}
      {q.reviewNotes ? (
        <Alert tone="warn">
          <strong>Observações da revisão:</strong> {q.reviewNotes}
        </Alert>
      ) : null}

      <Card className="grid gap-3">
        <h2 className="text-lg font-bold">Fluxo editorial</h2>
        <TransitionButtons
          id={q.id}
          status={q.status}
          isAuthor={q.authorId === user.id}
          isReviewer={isReviewer}
        />
      </Card>

      {editable ? (
        <QuestionForm
          topics={topics}
          initial={{
            id: q.id,
            topicId: q.topicId,
            stem: q.stem,
            difficulty: q.difficulty,
            options: q.options.map((o) => ({
              body: o.body,
              explanation: o.explanation,
              isCorrect: o.isCorrect,
            })),
            sources: q.sources.map((src) => ({ citation: src.citation, url: src.url ?? '' })),
          }}
        />
      ) : (
        <Card className="grid gap-3">
          <p className="font-semibold">{q.stem}</p>
          <ol className="grid gap-2">
            {q.options.map((o, i) => (
              <li
                key={o.id}
                className={
                  o.isCorrect
                    ? 'rounded-[var(--radius)] border border-success bg-success-soft p-3'
                    : 'rounded-[var(--radius)] border border-line p-3'
                }
              >
                <span className="font-mono">{'ABCDEF'[i]}.</span> {o.body}
                {o.explanation ? <p className="mt-1 text-sm text-muted">{o.explanation}</p> : null}
              </li>
            ))}
          </ol>
          <div className="text-sm text-muted">
            {q.sources.length ? (
              q.sources.map((src) => <p key={src.id}>Referência: {src.citation}</p>)
            ) : (
              <p>Sem referência cadastrada.</p>
            )}
          </div>
        </Card>
      )}

      {isReviewer && q.stats ? (
        <Card className="grid gap-1">
          <h2 className="text-lg font-bold">Uso pelos alunos</h2>
          <p className="text-muted">
            {q.stats.attempts === 0
              ? 'Ainda sem respostas.'
              : `${q.stats.attempts} respostas · ${Math.round((q.stats.correct / q.stats.attempts) * 100)}% de acerto`}
          </p>
        </Card>
      ) : null}

      {q.versions.length > 1 ? (
        <Card className="grid gap-2">
          <h2 className="text-lg font-bold">Versões</h2>
          <ul className="grid gap-1 text-sm">
            {q.versions.map((v) => (
              <li key={v.id}>
                {v.id === q.id ? (
                  <strong>v{v.version} (esta)</strong>
                ) : (
                  <Link href={`/admin/questoes/${v.id}`}>v{v.version}</Link>
                )}{' '}
                · {STATUS_LABEL[v.status]}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {q.history.length ? (
        <Card className="grid gap-2">
          <h2 className="text-lg font-bold">Auditoria</h2>
          <ul className="grid gap-1 font-mono text-xs text-muted">
            {q.history.map((h) => (
              <li key={h.id}>
                {fmt.format(h.createdAt)} · {h.action}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
