import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/states';
import { buttonClass } from '@/components/ui/button';
import { Badge, DemoBadge } from '@/components/ui/card';
import { listQuestions, STATUS_LABEL, type Status } from '@/features/editorial/service';
import { EDITORIAL_ROLES, requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Questões · Editorial' };

const ORDER: Status[] = ['draft', 'in_review', 'approved', 'published', 'archived'];

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireRole(EDITORIAL_ROLES, '/admin/questoes');
  const sp = await searchParams;
  const isReviewer = user.roles.includes('reviewer') || user.roles.includes('admin');
  // Revisor cai direto na fila do que espera por ele.
  const status = (ORDER as string[]).includes(sp.status ?? '')
    ? (sp.status as Status)
    : isReviewer
      ? 'in_review'
      : 'draft';
  const { rows, counts } = await listQuestions(user, { status });
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Questões</h1>
        <Link href="/admin/questoes/nova" className={buttonClass('primary')}>
          Nova questão
        </Link>
      </div>
      <nav aria-label="Status" className="flex gap-1 overflow-x-auto">
        {ORDER.map((st) => (
          <Link
            key={st}
            href={`/admin/questoes?status=${st}`}
            aria-current={st === status ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium no-underline',
              st === status
                ? 'bg-fg text-bg'
                : 'border border-line-strong text-muted hover:text-fg',
            )}
          >
            {STATUS_LABEL[st]} <span className="font-mono text-xs">{counts[st] ?? 0}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={`Nada em “${STATUS_LABEL[status]}”`}>
          {status === 'in_review'
            ? 'Quando alguém enviar uma questão para revisão, ela aparece aqui.'
            : 'Use “Nova questão” para começar.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((q) => (
            <li key={q.id}>
              <Link
                href={`/admin/questoes/${q.id}`}
                className="grid gap-1 rounded-[var(--radius)] border border-line bg-surface p-4 text-fg no-underline hover:border-line-strong"
              >
                <span className="line-clamp-2 font-medium">{q.stem}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge>{q.topicName}</Badge>v{q.version} · {q.authorName ?? 'sem autor'} ·{' '}
                  {fmt.format(q.updatedAt)}
                  {q.isDemo ? <DemoBadge /> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
