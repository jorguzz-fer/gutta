import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/password-forms';
import { Alert } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Nova senha' };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Criar nova senha" footer={<Link href="/entrar">Voltar para entrar</Link>}>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="danger">
          Esse link expirou ou é inválido. <Link href="/recuperar-senha">Peça um novo</Link>.
        </Alert>
      )}
    </AuthShell>
  );
}
