import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResendVerification } from '@/components/auth/resend-verification';

export const metadata: Metadata = { title: 'Confirme seu e-mail' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;
  const expired = error === 'token_expired' || error === 'invalid_token';
  return (
    <AuthShell
      title={expired ? 'Esse link expirou' : 'Confirme seu e-mail'}
      lead={
        expired
          ? 'Links de confirmação valem por 1 hora. Peça um novo abaixo.'
          : 'Abra o link que enviamos para continuar. Ele vale por 1 hora.'
      }
      footer={<Link href="/entrar">Voltar para entrar</Link>}
    >
      {email ? <ResendVerification email={email} /> : null}
    </AuthShell>
  );
}
