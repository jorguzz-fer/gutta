import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader, Flash, tableClass } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { ASSIGNABLE_ROLES, listUsers, ROLE_LABEL } from '@/features/admin/service';
import { requireRole, type Role } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Usuários' };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; q?: string; papel?: string }>;
}) {
  const user = await requireRole(['admin'], '/admin/usuarios');
  const sp = await searchParams;
  const role = ASSIGNABLE_ROLES.find((r) => r === sp.papel) as Role | undefined;
  const rows = await listUsers(user, { q: sp.q?.trim() || undefined, role });
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Usuários"
        lead="Contas, papéis e acesso. Toda mudança fica na auditoria. Mostra os 200 mais recentes; use a busca para achar alguém."
      />
      <Flash ok={sp.ok} erro={sp.erro} />
      <form className="flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Nome ou e-mail"
          aria-label="Buscar usuário"
          className="max-w-sm"
        />
        <Select
          name="papel"
          defaultValue={role ?? ''}
          aria-label="Filtrar por papel"
          className="max-w-48"
        >
          <option value="">Todos os papéis</option>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <Card className="overflow-x-auto p-0 pt-4">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Papéis</th>
              <th>E-mail</th>
              <th>Criada em</th>
              <th>Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/usuarios/${u.id}`} className="font-semibold">
                    {u.name}
                  </Link>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <span className="text-sm text-muted">Aluno</span>
                    ) : null}
                    {u.roles.map((r) => (
                      <Badge key={r} tone={r === 'admin' ? 'accent' : 'neutral'}>
                        {ROLE_LABEL[r] ?? r}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td>
                  {u.emailVerified ? (
                    <Badge tone="success">Confirmado</Badge>
                  ) : (
                    <Badge tone="warn">Pendente</Badge>
                  )}
                </td>
                <td className="tabular text-sm">{fmt.format(u.createdAt)}</td>
                <td className="tabular text-sm">
                  {u.lastSeen ? fmt.format(new Date(u.lastSeen)) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">
                  Ninguém encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
