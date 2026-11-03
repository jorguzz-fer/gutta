import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { privacyOverview } from '@/features/privacy/admin';
import {
  executeDeletionAction,
  resolveRequestAction,
  runRetentionAction,
  saveRetentionAction,
} from '@/features/privacy/admin-actions';
import { RIGHT_LABEL } from '@/features/privacy/service';
import { requireRole } from '@/lib/auth/session';
import { legalInfo } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacidade (LGPD)' };

/*
  Fila LGPD. Pedido mais antigo primeiro, com o prazo legal (15 dias) bem visível. Exclusão
  roda sozinha no fim do prazo de desistência; aqui o admin antecipa ou responde os outros.
*/
export default async function AdminPrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const admin = await requireRole(['admin'], '/admin/privacidade');
  const sp = await searchParams;
  const d = await privacyOverview(admin);
  const legal = legalInfo();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Privacidade (LGPD)"
        lead="Pedidos dos titulares com prazo de resposta, exclusão de contas e prazos de retenção. Tudo fica na auditoria."
      />
      <Flash ok={sp.ok} erro={sp.erro} />
      {!legal.complete ? (
        <Alert tone="warn">
          Faltam os dados do controlador e do encarregado (LEGAL_CONTROLLER_NAME, DPO_NAME,
          DPO_EMAIL). Sem eles, a política mostra “a definir”. Preencha antes do piloto.
        </Alert>
      ) : null}

      <section aria-labelledby="fila" className="grid gap-3">
        <h2 id="fila" className="text-xl">
          Pedidos abertos ({d.open.length})
        </h2>
        {d.open.length === 0 ? (
          <Card>
            <p className="text-muted">Nenhum pedido aberto.</p>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {d.open.map((r) => {
              const { dueAt: due, daysLeft } = r;
              return (
                <li key={r.id}>
                  <Card className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong>{RIGHT_LABEL[r.kind]}</strong>
                        <Link href={`/admin/usuarios/${r.userId}`}>{r.name}</Link>
                        <span className="text-sm text-muted">{r.email}</span>
                      </span>
                      <Badge tone={daysLeft <= 3 ? 'danger' : 'warn'}>
                        {daysLeft > 0
                          ? `prazo ${fmt.format(due)} · ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`
                          : `vencido em ${fmt.format(due)}`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted">
                      Aberto em {fmt.format(r.createdAt)}
                      {r.details ? `: ${r.details}` : ''}
                    </p>
                    {r.kind === 'deletion' ? (
                      <form
                        action={executeDeletionAction}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="userId" value={r.userId} />
                        <Field label={`Para excluir ${r.name} agora, digite EXCLUIR`}>
                          {(p) => (
                            <Input
                              {...p}
                              name="confirm"
                              autoComplete="off"
                              pattern="EXCLUIR"
                              required
                              className="max-w-48"
                            />
                          )}
                        </Field>
                        <Button type="submit" variant="danger">
                          Excluir agora
                        </Button>
                      </form>
                    ) : (
                      <form action={resolveRequestAction} className="grid gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <Field label={`Resposta para ${r.name}`}>
                          {(p) => (
                            <Textarea {...p} name="response" required minLength={10} rows={3} />
                          )}
                        </Field>
                        <div>
                          <Button type="submit" variant="secondary">
                            Responder e encerrar
                          </Button>
                        </div>
                      </form>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="retencao" className="grid content-start gap-3">
          <h2 id="retencao" className="text-lg">
            Prazos de retenção
          </h2>
          <p className="text-sm text-muted">
            Valores de rascunho, a confirmar na revisão jurídica. A limpeza roda a cada deploy e
            quando você pede.
          </p>
          <form action={saveRetentionAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Texto das conversas com o tutor (dias)">
              {(p) => (
                <Input
                  {...p}
                  name="tutorDays"
                  type="number"
                  min={30}
                  defaultValue={d.retention.tutorDays}
                />
              )}
            </Field>
            <Field label="Eventos de uso (dias)">
              {(p) => (
                <Input
                  {...p}
                  name="eventsDays"
                  type="number"
                  min={90}
                  defaultValue={d.retention.eventsDays}
                />
              )}
            </Field>
            <Field label="Auditoria (dias)">
              {(p) => (
                <Input
                  {...p}
                  name="auditDays"
                  type="number"
                  min={365}
                  defaultValue={d.retention.auditDays}
                />
              )}
            </Field>
            <Field label="Prazo para desistir da exclusão (dias)">
              {(p) => (
                <Input
                  {...p}
                  name="deletionGraceDays"
                  type="number"
                  min={0}
                  max={15}
                  defaultValue={d.retention.deletionGraceDays}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary">
                Salvar prazos
              </Button>
            </div>
          </form>
          <form action={runRetentionAction} className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit">Rodar limpeza agora</Button>
            <span className="text-sm text-muted">
              {d.lastRun ? `Última: ${fmt.format(d.lastRun.at)}.` : 'Ainda não rodou neste banco.'}
            </span>
          </form>
        </Card>

        <Card as="section" aria-labelledby="historico" className="grid content-start gap-3">
          <h2 id="historico" className="text-lg">
            Histórico
          </h2>
          <p className="text-sm text-muted">
            {d.exports30d} exportações de dados nos últimos 30 dias. {d.erased.length} exclusões
            recentes (só o registro, sem nome nem e-mail).
          </p>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Pedidos encerrados">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Pessoa</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{RIGHT_LABEL[r.kind]}</td>
                    <td>{r.name}</td>
                    <td className="text-sm">
                      {r.status === 'done' ? 'respondido' : 'cancelado'}
                      {r.resolvedAt ? ` · ${fmt.format(r.resolvedAt)}` : ''}
                    </td>
                  </tr>
                ))}
                {d.recent.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted">
                      Nada encerrado ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
