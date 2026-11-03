import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ChangePasswordForm } from '@/components/auth/password-forms';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function ChangePasswordPage() {
  const user = await requireUser('/seguranca/senha');
  return (
    <AuthShell
      title="Trocar senha"
      lead="Se você recebeu uma senha temporária, troque por uma sua agora."
    >
      <ChangePasswordForm />
      <p className="text-sm text-muted">
        <Link href={user.roles.includes('admin') ? '/admin' : '/app/perfil'}>Voltar</Link>
      </p>
    </AuthShell>
  );
}
