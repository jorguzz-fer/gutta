import type { Metadata } from 'next';
import { AdminHeader, Checkbox, Flash } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { saveFlagsAction } from '@/features/flags/actions';
import { FEATURES } from '@/features/flags/catalog';
import { flags } from '@/features/flags/service';
import { requireRole } from '@/lib/auth/session';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Funcionalidades' };

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await requireRole(['admin'], '/admin/funcionalidades');
  const sp = await searchParams;
  const current = await flags();
  const forced = env().FEATURES_ON;
  return (
    <div className="grid gap-6">
      <AdminHeader
        title="Funcionalidades"
        lead="Cada módulo da v2 entra desligado. Ligue quando ele estiver pronto para os alunos. A mudança vale em até 30 segundos e fica na auditoria."
      />
      <Flash {...sp} />
      {forced ? (
        <Alert tone="warn">
          FEATURES_ON está definida no servidor ({forced}). Os módulos dessa lista ficam ligados
          mesmo desmarcados aqui.
        </Alert>
      ) : null}
      <Card>
        <form action={saveFlagsAction} className="grid gap-2">
          {FEATURES.map((f) => (
            <div key={f.key} className="grid gap-0.5 border-b border-line pb-2 last:border-0">
              <Checkbox name={f.key} label={f.label} defaultChecked={current[f.key]} />
              <p className="pl-8 text-sm text-muted">{f.text}</p>
            </div>
          ))}
          <div className="pt-2">
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
