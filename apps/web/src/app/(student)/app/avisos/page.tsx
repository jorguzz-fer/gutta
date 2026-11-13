import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { requireFeature } from '@/features/flags/service';
import {
  readAllAction,
  readNotificationAction,
  savePreferencesAction,
} from '@/features/notifications/actions';
import { getPreferences, listNotifications } from '@/features/notifications/service';
import { requireStudent } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Avisos' };

const WHEN = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/*
  Avisos e preferências (SPEC v2, LEM-11, 12, 14, 15, 18). Um aviso por compromisso, mesmo que
  ele apareça na disciplina e no Meu Espaço (LEM-13). E-mail só se o aluno ligar.
*/
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  await requireFeature('lembretes');
  const user = await requireStudent('/app/avisos');
  const sp = await searchParams;
  const [{ items, unread }, { preferences: p }] = await Promise.all([
    listNotifications(user.id),
    getPreferences(user.id),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid gap-1 lg:col-span-2">
        <h1 className="text-3xl md:text-4xl">Avisos</h1>
        <p className="text-muted">
          Lembretes, aulas, provas e entregas. <Link href="/app/lembretes">Meus lembretes</Link>.
        </p>
      </div>
      {sp.salvo ? (
        <Alert tone="success" className="lg:col-span-2">
          Preferências salvas.
        </Alert>
      ) : null}
      <Card as="section" aria-labelledby="lista" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="lista" className="text-lg font-semibold">
            {unread ? `${unread} ${unread === 1 ? 'aviso novo' : 'avisos novos'}` : 'Tudo lido'}
          </h2>
          {unread ? (
            <form action={readAllAction}>
              <Button type="submit" variant="secondary">
                Marcar tudo como lido
              </Button>
            </form>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nenhum aviso por enquanto.</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'grid gap-1 rounded-[var(--radius)] border p-3',
                  n.read ? 'border-line' : 'border-accent',
                )}
              >
                <p className="font-semibold">
                  {n.read ? null : <span className="sr-only">Novo: </span>}
                  {n.title}
                </p>
                {n.body ? <p className="text-sm">{n.body}</p> : null}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted">{WHEN.format(new Date(n.at))}</span>
                  <form action={readNotificationAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="link" value={n.link ?? ''} />
                    <Button type="submit" variant="ghost">
                      {n.link ? 'Abrir' : 'Marcar como lido'}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" aria-labelledby="prefs" className="grid content-start gap-3">
        <h2 id="prefs" className="text-lg font-semibold">
          Como avisar
        </h2>
        <form action={savePreferencesAction} className="grid gap-3">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="academicAlerts"
              defaultChecked={p.academicAlerts}
              className="size-5"
            />
            Avisos de aulas, provas e entregas
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="emailEnabled"
              defaultChecked={p.emailEnabled}
              className="size-5"
            />
            Receber também por e-mail
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Horário silencioso</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="quiet"
                defaultChecked={p.quietFrom !== null}
                className="size-5"
              />
              Não mandar e-mail neste período
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm">
                Das
                <input
                  type="time"
                  name="quietFrom"
                  defaultValue={p.quietFrom ?? '22:00'}
                  className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Até
                <input
                  type="time"
                  name="quietUntil"
                  defaultValue={p.quietUntil ?? '07:00'}
                  className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
                />
              </label>
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm">
            No máximo, e-mails por dia
            <input
              type="number"
              name="dailyCap"
              min={1}
              max={50}
              defaultValue={p.dailyCap}
              className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
            />
          </label>
          <p className="text-sm text-muted">
            Na plataforma, os avisos sempre aparecem aqui. O e-mail vai para o endereço da sua
            conta.
          </p>
          <div>
            <Button type="submit">Salvar preferências</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
