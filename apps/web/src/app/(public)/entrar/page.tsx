import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { safeNext } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Entrar' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Entrar"
      footer={
        <>
          Ainda não tem conta? <Link href="/cadastro">Criar conta grátis</Link>
        </>
      }
    >
      <SignInForm next={safeNext(next)} />
    </AuthShell>
  );
}
