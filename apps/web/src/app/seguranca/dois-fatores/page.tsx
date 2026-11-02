import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { Alert } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Verificação em duas etapas' };

export default async function TwoFactorSettingsPage() {
  const user = await requireUser('/seguranca/dois-fatores');
  return (
    <AuthShell
      title="Verificação em duas etapas"
      lead={
        user.roles.includes('admin')
          ? 'Contas de administração precisam de um segundo fator para acessar o editorial.'
          : 'Um código do celular, além da senha, protege sua conta.'
      }
    >
      {user.twoFactorEnabled ? (
        <Alert tone="success">Já está ativa nesta conta.</Alert>
      ) : (
        <TwoFactorSetup />
      )}
    </AuthShell>
  );
}
