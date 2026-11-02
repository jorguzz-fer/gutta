import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Criar conta"
      lead="Grátis. Em seguida você escolhe curso, semestre e disciplinas."
      footer={
        <>
          Já tem conta? <Link href="/entrar">Entrar</Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
