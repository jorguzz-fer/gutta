'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get('code') ?? '').replace(/\s+/g, '');
    const trustDevice = form.get('trust') === 'on';
    setPending(true);
    setError(null);
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setPending(false);
    if (error) {
      setError(
        useBackup
          ? 'Código de recuperação inválido.'
          : 'Código incorreto ou expirado. Use o código atual do app.',
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label={useBackup ? 'Código de recuperação' : 'Código de 6 dígitos'}
        hint={
          useBackup
            ? 'Um dos códigos que você guardou ao ativar.'
            : 'Abra o app autenticador e digite o código do Cognuss.'
        }
      >
        {(p) => (
          <Input
            {...p}
            name="code"
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        )}
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input
          type="checkbox"
          name="trust"
          defaultChecked
          className="size-5 accent-[var(--accent)]"
        />
        Não pedir de novo neste aparelho por 12 horas
      </label>
      <Button type="submit" size="lg" loading={pending}>
        Confirmar
      </Button>
      <button
        type="button"
        className="justify-self-start text-sm text-accent underline"
        onClick={() => setUseBackup((v) => !v)}
      >
        {useBackup ? 'Usar o código do app' : 'Usar um código de recuperação'}
      </button>
    </form>
  );
}
