import type { Metadata } from 'next';
import Link from 'next/link';
import { PIECE_TYPE_LABEL } from '@gutta/core';
import { AdminHeader } from '@/components/admin/ui';
import { PublishButton } from '@/components/production/review-actions';
import { Badge, Card } from '@/components/ui/card';
import { reviewQueue } from '@/features/production/review';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Revisão de aulas' };

// Fila do revisor (docs/producao/ESPECIFICACAO.md, telas do admin, item 4): as peças em revisão,
// agrupadas por aula, e a publicação das peças aprovadas.
export default async function ReviewQueuePage() {
  const user = await requireRole(['reviewer', 'admin'], '/admin/revisao');
  const { items } = await reviewQueue(user.id);
  const batches = [...new Map(items.map((i) => [i.batchId, i])).values()];
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Revisão de aulas"
        lead="Peças geradas pela produção de aulas esperando revisão médica. Aprove a peça e as questões, ou peça ajuste num trecho: a IA gera uma nova versão a partir do seu comentário. Nada chega ao aluno sem aprovação."
      />
      {batches.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Nenhuma peça esperando revisão.</p>
        </Card>
      ) : (
        batches.map((b) => {
          const list = items.filter((i) => i.batchId === b.batchId);
          const approved = list.filter((i) => i.moduleStatus === 'approved').length;
          return (
            <Card
              key={b.batchId}
              as="section"
              aria-labelledby={`aula-${b.batchId}`}
              className="grid gap-3"
            >
              <div className="grid gap-1">
                <h2 id={`aula-${b.batchId}`} className="text-xl">
                  {b.batchTitle}
                </h2>
                <p className="text-sm text-muted">{b.disciplineName}</p>
              </div>
              <ul className="grid gap-2">
                {list.map((i) => (
                  <li
                    key={i.taskId}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 first:border-0 first:pt-0"
                  >
                    <div className="grid gap-0.5">
                      <Link href={`/admin/revisao/${i.taskId}`} className="font-semibold">
                        {String(i.position).padStart(2, '0')} · {i.title}
                      </Link>
                      <span className="text-sm text-muted">
                        {i.pieceType ? PIECE_TYPE_LABEL[i.pieceType] : 'Peça'} · {i.questions}{' '}
                        {i.questions === 1 ? 'questão' : 'questões'}
                      </span>
                    </div>
                    <Badge
                      tone={
                        i.moduleStatus !== 'in_review'
                          ? 'success'
                          : i.taskStatus === 'generated'
                            ? 'accent'
                            : i.taskStatus === 'failed'
                              ? 'danger'
                              : 'neutral'
                      }
                    >
                      {i.moduleStatus === 'published'
                        ? 'Publicada'
                        : i.moduleStatus === 'approved'
                          ? 'Aprovada'
                          : i.taskStatus === 'generated'
                            ? i.backFromChanges
                              ? 'Nova versão para revisar'
                              : 'Para revisar'
                            : i.taskStatus === 'failed'
                              ? 'Ajuste falhou'
                              : 'Gerando o ajuste'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <PublishButton batchId={b.batchId} count={approved} />
            </Card>
          );
        })
      )}
    </div>
  );
}
