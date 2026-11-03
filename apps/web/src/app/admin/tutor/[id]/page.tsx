import type { Metadata } from 'next';
import { AdminHeader } from '@/components/admin/ui';
import { Badge, Card } from '@/components/ui/card';
import { tutorConversation } from '@/features/tutor/service';
import { requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Conversa do tutor' };

export default async function TutorConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole(['admin'], `/admin/tutor/${id}`);
  const c = await tutorConversation(user, id);
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const total = c.messages.reduce((a, m) => a + m.costMicros, 0);
  return (
    <div className="grid gap-6">
      <AdminHeader
        title={`${c.studentName} · ${c.moduleTitle}`}
        crumbs={[{ href: '/admin/tutor', label: 'Tutor IA' }]}
        lead={`Custo estimado da conversa: US$ ${(total / 1_000_000).toFixed(4)}`}
      />
      <ol className="grid gap-3">
        {c.messages.map((m) => (
          <li key={m.id}>
            <Card className={cn('grid gap-1 p-4', m.role === 'user' && 'border-accent/40')}>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <strong className="text-fg">{m.role === 'user' ? 'Aluno' : 'Tutor'}</strong>
                {fmt.format(m.createdAt)}
                {m.role === 'assistant' ? (
                  <>
                    · {m.model} · {m.inputTokens}+{m.outputTokens} tokens · US${' '}
                    {(m.costMicros / 1_000_000).toFixed(4)}
                    {m.refused ? <Badge tone="warn">recusa</Badge> : null}
                  </>
                ) : null}
              </span>
              <p className="whitespace-pre-wrap">
                {m.redactedAt ? (
                  <em className="text-muted">
                    Texto apagado (pedido do aluno ou prazo de retenção).
                  </em>
                ) : (
                  m.content
                )}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
