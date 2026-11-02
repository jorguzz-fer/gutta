import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { RequestResetForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecoverPage() {
  return (
    <AuthShell
      title="Recuperar senha"
      lead="Digite o e-mail da sua conta e enviamos um link para criar uma senha nova."
      footer={<Link href="/entrar">Voltar para entrar</Link>}
    >
      <RequestResetForm />
    </AuthShell>
  );
}
