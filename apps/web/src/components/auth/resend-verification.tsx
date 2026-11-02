'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle');
  async function resend() {
    setState('pending');
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/onboarding' });
    setState(error ? 'error' : 'sent');
  }
  return (
    <div className="grid gap-3">
      {state === 'sent' ? (
        <Alert tone="success">Link reenviado. Confira também a caixa de spam.</Alert>
      ) : null}
      {state === 'error' ? (
        <Alert tone="danger">Não deu para reenviar agora. Espere alguns minutos.</Alert>
      ) : null}
      <Button
        variant="secondary"
        onClick={resend}
        loading={state === 'pending'}
        disabled={state === 'sent'}
      >
        Reenviar link
      </Button>
    </div>
  );
}
