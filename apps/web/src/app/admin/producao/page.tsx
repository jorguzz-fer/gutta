import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, tableClass } from '@/components/admin/ui';
import { NewBatchForm } from '@/components/production/new-batch-form';
import { buttonClass } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { BATCH_STATUS } from '@/features/production/labels';
import { listBatches, productionOptions } from '@/features/production/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Produção de aulas' };

// Produção de aulas interativas (docs/producao/ESPECIFICACAO.md; ADR 0021): lista de lotes e
// envio de uma aula nova. Fase 1: entrada e plano.
export default async function ProductionPage() {
  const user = await requireRole(['admin'], '/admin/producao');
  const [batches, options] = await Promise.all([listBatches(user.id), productionOptions(user.id)]);
  const date = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Produção de aulas"
        lead="A aula do professor vira peças interativas e questões. Envie o arquivo: o sistema separa os slides, acha os pedidos do professor e a IA planeja cada peça. Você aprova o plano antes de qualquer gasto com mídia."
        action={
          <Link href="/admin/producao/vozes" className={buttonClass('secondary')}>
            Vozes e cota de mídia
          </Link>
        }
      />
      <Card as="section" aria-labelledby="lotes" className="grid gap-3">
        <h2 id="lotes" className="text-xl">
          Lotes
        </h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma aula enviada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col">Aula</th>
                  <th scope="col">Disciplina</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Mídia estimada</th>
                  <th scope="col">Enviada em</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const st = BATCH_STATUS[b.status];
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/admin/producao/${b.id}`}>{b.title}</Link>
                      </td>
                      <td>{b.disciplineName}</td>
                      <td>
                        <Badge tone={st.tone}>{st.text}</Badge>
                      </td>
                      <td>{b.status === 'ready' ? `${b.estimatedCredits} créditos` : '—'}</td>
                      <td>{date.format(new Date(b.createdAt))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card as="section" aria-labelledby="novo-lote" className="grid gap-3">
        <h2 id="novo-lote" className="text-xl">
          Novo lote
        </h2>
        <NewBatchForm options={options} />
      </Card>
    </div>
  );
}
