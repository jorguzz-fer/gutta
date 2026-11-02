'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

export function RequestResetForm() {
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle');
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '')
      .trim()
      .toLowerCase();
    setState('pending');
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/redefinir-senha',
    });
    // Mesma resposta exista ou não a conta (sem enumeração).
    setState(error && error.status === 429 ? 'error' : 'sent');
  }
  if (state === 'sent') {
    return (
      <Alert tone="success">
        Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha. Ele
        vale por 1 hora.
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {state === 'error' ? (
        <Alert tone="danger">Muitas tentativas. Espere alguns minutos.</Alert>
      ) : null}
      <Field label="E-mail da conta">
        {(p) => (
          <Input {...p} name="email" type="email" inputMode="email" autoComplete="email" required />
        )}
      </Field>
      <Button type="submit" size="lg" loading={state === 'pending'}>
        Enviar link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get('password') ?? '');
    if (newPassword.length < 8) {
      setError('A senha precisa de pelo menos 8 caracteres.');
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) {
      setError('Esse link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
      return;
    }
    router.replace('/entrar?senha=redefinida');
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label="Nova senha"
        hint="Pelo menos 8 caracteres. Ao salvar, você sai de todos os aparelhos."
      >
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Salvar nova senha
      </Button>
    </form>
  );
}
