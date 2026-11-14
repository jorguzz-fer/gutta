'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClientApiError, api } from '@/lib/client-api';

/*
  Pedido de revisão ao Equilíbrio (EQU-18): da aula (AUL-22), da falta (FAL-08), da prova
  (CAL-10) ou do conteúdo de uma nota (NOT-15). Vira tarefa; nada entra na agenda antes de o
  aluno aceitar uma proposta.
*/
export function RequestReview({
  kind,
  id,
  label,
}: {
  kind: 'aula' | 'falta' | 'prova' | 'nota';
  id: string;
  label: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  if (state === 'done')
    return (
      <p role="status" className="text-sm">
        Pedido enviado ao Equilíbrio. Ele entra na próxima proposta da semana.{' '}
        <Link href="/app/equilibrio">Abrir o Equilíbrio</Link>
      </p>
    );
  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="secondary"
        loading={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setError('');
          try {
            await api('/planning/requests', { method: 'POST', body: { kind, id } });
            setState('done');
          } catch (err) {
            setError(err instanceof ClientApiError ? err.message : 'Não deu para pedir agora.');
            setState('idle');
          }
        }}
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
