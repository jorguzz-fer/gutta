'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { renderSVG } from 'uqr';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';

// Ativação do segundo fator em 3 passos, com progresso visível (Gradiente de Meta).
export function TwoFactorSetup() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uri, setUri] = useState<string>('');
  const [codes, setCodes] = useState<string[]>([]);
  const qr = useMemo(() => (uri ? renderSVG(uri, { border: 1 }) : ''), [uri]);
  const secret = useMemo(() => (uri ? (new URL(uri).searchParams.get('secret') ?? '') : ''), [uri]);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !('totpURI' in data)) {
      setError('Senha incorreta.');
      return;
    }
    setUri(data.totpURI);
    setCodes(data.backupCodes);
    setStep(2);
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s+/g, '');
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError(
        'Código incorreto. Confira se o relógio do celular está certo e use o código atual.',
      );
      return;
    }
    setStep(3);
  }

  return (
    <div className="grid gap-4">
      <p className="font-mono text-xs text-muted">Passo {step} de 3</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {step === 1 ? (
        <form onSubmit={start} className="grid gap-4">
          <Field label="Confirme sua senha">
            {(p) => (
              <PasswordInput
                {...p}
                name="password"

                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <Button type="submit" loading={pending}>
            Continuar
          </Button>
        </form>
      ) : null}
      {step === 2 ? (
        <form onSubmit={confirm} className="grid gap-4">
          <p>Escaneie com um app autenticador (Google Authenticator, 1Password, Authy).</p>
          <div
            className="w-48 rounded-[var(--radius)] bg-white p-2"
            role="img"
            aria-label="QR code para o app autenticador"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-sm text-muted">
            Sem câmera? Digite a chave:{' '}
            <code className="font-mono break-all text-fg">{secret}</code>
          </p>
          <Field label="Código de 6 dígitos do app">
            {(p) => (
              <Input {...p} name="code" inputMode="numeric" autoComplete="one-time-code" required />
            )}
          </Field>
          <Button type="submit" loading={pending}>
            Ativar
          </Button>
        </form>
      ) : null}
      {step === 3 ? (
        <div className="grid gap-4">
          <Alert tone="success">Verificação em duas etapas ativa.</Alert>
          <Card>
            <h2 className="font-bold">Guarde estes códigos de recuperação</h2>
            <p className="mt-1 text-sm text-muted">
              Cada um funciona uma vez, se você perder o celular.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
          <Button
            onClick={() => {
              router.replace('/admin');
              router.refresh();
            }}
          >
            Ir para o editorial
          </Button>
        </div>
      ) : null}
    </div>
  );
}
