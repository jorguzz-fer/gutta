'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') ?? '');
    setPending(true);
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signIn.email({ email, password });
    if (error) {
      setPending(false);
      if (error.status === 403) {
        setNotice(`Falta confirmar seu e-mail. Reenviamos o link para ${email}.`);
      } else if (error.status === 429) {
        setError('Muitas tentativas. Espere um minuto e tente de novo.');
      } else {
        setError('E-mail ou senha incorretos.');
      }
      return;
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      router.push(`/entrar/dois-fatores?next=${encodeURIComponent(next)}`);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="warn">{notice}</Alert> : null}
      <Field label="E-mail">
        {(p) => (
          <Input {...p} name="email" type="email" inputMode="email" autoComplete="email" required />
        )}
      </Field>
      <Field label="Senha">
        {(p) => <PasswordInput {...p} name="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Entrar
      </Button>
      <Link href="/recuperar-senha" className="justify-self-start text-sm">
        Esqueci minha senha
      </Link>
    </form>
  );
}
