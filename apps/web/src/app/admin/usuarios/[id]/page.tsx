import type { Metadata } from 'next';
import { AdminHeader, Flash } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { revokeSessionsAction, setRoleAction, verifyEmailAction } from '@/features/admin/actions';
import { ASSIGNABLE_ROLES, getUserAdmin, ROLE_LABEL } from '@/features/admin/service';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Usuário' };

const ROLE_HINT: Partial<Record<string, string>> = {
  teacher: 'Cria turmas e acompanha o desempenho de quem entrar nelas.',
  editor: 'Escreve questões, flashcards e módulos.',
  reviewer: 'Revisa e publica conteúdo de outras pessoas.',
  admin: 'Tudo, inclusive catálogo, usuários e instituições. Exige 2FA.',
  support: 'Atende alunos (sem acesso ao conteúdo editorial).',
};

export default async function UserAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const admin = await requireRole(['admin'], `/admin/usuarios/${id}`);
  const sp = await searchParams;
  const { user, roles, student, sessions, history } = await getUserAdmin(admin, id);
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="grid gap-6">
      <AdminHeader
        title={user.name}
        lead={user.email}
        crumbs={[{ href: '/admin/usuarios', label: 'Usuários' }]}
      />
      <Flash {...sp} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="conta" className="grid content-start gap-3">
          <h2 id="conta" className="text-lg">
            Conta
          </h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-[15px]">
            <dt className="text-muted">Criada em</dt>
            <dd>{fmt.format(user.createdAt)}</dd>
            <dt className="text-muted">E-mail</dt>
            <dd>{user.emailVerified ? 'confirmado' : 'não confirmado'}</dd>
            <dt className="text-muted">2FA</dt>
            <dd>{user.twoFactorEnabled ? 'ativo' : 'desligado'}</dd>
            <dt className="text-muted">Sessões ativas</dt>
            <dd className="tabular">{sessions}</dd>
            {student ? (
              <>
                <dt className="text-muted">Curso</dt>
                <dd>
                  {student.courseName} · {student.semester}º semestre
                  {student.institutionName ? ` · ${student.institutionName}` : ''}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            {!user.emailVerified ? (
              <form action={verifyEmailAction}>
                <input type="hidden" name="id" value={user.id} />
                <Button type="submit" variant="secondary">
                  Confirmar e-mail
                </Button>
              </form>
            ) : null}
            {sessions > 0 ? (
              <form action={revokeSessionsAction}>
                <input type="hidden" name="id" value={user.id} />
                <Button type="submit" variant="danger">
                  Encerrar sessões
                </Button>
              </form>
            ) : null}
          </div>
          {!user.emailVerified ? (
            <p className="text-sm text-muted">
              Confirme só e-mails de quem você conhece: sem confirmação, a pessoa não entra.
            </p>
          ) : null}
        </Card>

        <Card as="section" aria-labelledby="papeis" className="grid content-start gap-3">
          <h2 id="papeis" className="text-lg">
            Papéis
          </h2>
          <p className="text-sm text-muted">
            Toda conta já é aluno. Os papéis abaixo somam acesso.
          </p>
          {admin.id === user.id ? (
            <Alert tone="warn">Esta é a sua conta: você não pode tirar o seu próprio admin.</Alert>
          ) : null}
          <ul className="grid gap-2">
            {ASSIGNABLE_ROLES.map((r) => {
              const has = roles.includes(r);
              return (
                <li
                  key={r}
                  className="flex items-center justify-between gap-3 border-b border-line pb-2"
                >
                  <span>
                    <span className="font-semibold">{ROLE_LABEL[r]}</span>{' '}
                    {has ? <Badge tone="success">ativo</Badge> : null}
                    <span className="block text-sm text-muted">{ROLE_HINT[r]}</span>
                  </span>
                  {!(has && r === 'admin' && admin.id === user.id) ? (
                    <form action={setRoleAction}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="role" value={r} />
                      <input type="hidden" name="grant" value={has ? '0' : '1'} />
                      <Button type="submit" variant={has ? 'ghost' : 'secondary'}>
                        {has ? 'Remover' : 'Dar papel'}
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card as="section" aria-labelledby="hist" className="grid gap-2">
        <h2 id="hist" className="text-lg">
          Histórico
        </h2>
        {history.length === 0 ? <p className="text-sm text-muted">Sem registros ainda.</p> : null}
        <ul className="grid gap-1 text-sm">
          {history.map((h) => (
            <li key={h.id}>
              <span className="text-muted">{fmt.format(h.createdAt)}</span> · {h.action}
              {h.metadata && (h.metadata as { role?: string }).role
                ? ` (${(h.metadata as { role?: string }).role})`
                : ''}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
