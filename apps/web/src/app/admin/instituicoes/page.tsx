import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Flash, StatusBadge, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Card, DemoBadge } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { saveInstitutionAction, setInstitutionStatusAction } from '@/features/admin/actions';
import { listInstitutions, type InstitutionStatus } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Instituições' };

const FILTERS: { key?: InstitutionStatus; label: string }[] = [
  { label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'active', label: 'Ativas' },
  { key: 'rejected', label: 'Recusadas' },
];

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; status?: string; q?: string }>;
}) {
  const user = await requireRole(['admin'], '/admin/instituicoes');
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key === sp.status)?.key;
  const rows = await listInstitutions(user, { status, q: sp.q?.trim() || undefined });
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Instituições"
        lead="Alunos sugerem a faculdade que não encontram; ela fica pendente até você aprovar. Aprovada, aparece para todos no cadastro."
      />
      <Flash ok={sp.ok} erro={sp.erro} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/admin/instituicoes?status=${f.key}` : '/admin/instituicoes'}
            aria-current={status === f.key ? 'page' : undefined}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-1.5 text-sm no-underline',
              status === f.key ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted',
            )}
          >
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Buscar pelo nome"
            aria-label="Buscar instituição"
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      <Card className="overflow-x-auto p-0 pt-4">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Instituição</th>
              <th>Alunos</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <details>
                    <summary className="cursor-pointer font-semibold">
                      {i.name} {i.isDemo ? <DemoBadge /> : null}
                    </summary>
                    <form
                      action={saveInstitutionAction}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_4rem_auto] sm:items-end"
                    >
                      <input type="hidden" name="id" value={i.id} />
                      <label className="grid gap-1 text-xs text-muted">
                        Nome
                        <Input name="name" defaultValue={i.name} required />
                      </label>
                      <label className="grid gap-1 text-xs text-muted">
                        Cidade
                        <Input name="city" defaultValue={i.city ?? ''} />
                      </label>
                      <label className="grid gap-1 text-xs text-muted">
                        UF
                        <Input name="state" defaultValue={i.state ?? ''} maxLength={2} />
                      </label>
                      <Button type="submit" variant="secondary">
                        Salvar
                      </Button>
                    </form>
                  </details>
                  <div className="text-xs text-muted">
                    {[i.city, i.state].filter(Boolean).join(' · ') || 'sem cidade'}
                    {i.suggestedByEmail ? ` · sugerida por ${i.suggestedByEmail}` : ''}
                  </div>
                </td>
                <td className="tabular">{i.students}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {i.status !== 'active' ? (
                      <form action={setInstitutionStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value="active" />
                        <Button type="submit" variant="secondary">
                          Aprovar
                        </Button>
                      </form>
                    ) : null}
                    {i.status !== 'rejected' ? (
                      <form action={setInstitutionStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <Button type="submit" variant="ghost">
                          {i.status === 'active' ? 'Desativar' : 'Recusar'}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted">
                  Nada por aqui.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card as="section" aria-labelledby="nova" className="grid gap-4">
        <h2 id="nova" className="text-xl">
          Nova instituição
        </h2>
        <form
          action={saveInstitutionAction}
          className="grid gap-4 sm:grid-cols-[1fr_12rem_5rem_auto] sm:items-end"
        >
          <Field label="Nome">{(p) => <Input {...p} name="name" required />}</Field>
          <Field label="Cidade" optional>
            {(p) => <Input {...p} name="city" />}
          </Field>
          <Field label="UF" optional>
            {(p) => <Input {...p} name="state" maxLength={2} />}
          </Field>
          <Button type="submit">Criar</Button>
        </form>
      </Card>
    </div>
  );
}
