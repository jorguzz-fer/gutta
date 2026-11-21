'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';

/**
 * Gerar a peça de novo. Com pedido de ajuste, a IA parte da versão atual e corrige o que foi
 * pedido; sem ele, escreve uma versão nova a partir do plano.
 */
export function RegenerateForm({ taskId, hasVersion }: { taskId: string; hasVersion: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '');
    setBusy(true);
    setError(null);
    try {
      await api(`/production/tasks/${taskId}/regenerate`, {
        method: 'POST',
        body: { note: note || undefined },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para gerar agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {hasVersion ? (
        <Field
          label="Pedido de ajuste"
          optional
          hint="Ex.: aumentar o contraste das setas no tema escuro; trocar o exemplo do cenário 2."
        >
          {(p) => <Textarea {...p} name="note" rows={3} maxLength={2000} />}
        </Field>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? 'Enviando…' : 'Gerar de novo'}
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
