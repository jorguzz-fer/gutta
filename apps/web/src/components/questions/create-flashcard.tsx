'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ClientApiError } from '@/lib/client-api';

// Transforma o erro em flashcard pessoal: frente = enunciado, verso = resposta e explicação.
export function CreateFlashcardFromQuestion({ questionId }: { questionId: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function create() {
    setState('pending');
    try {
      const res = await api<{ created: boolean }>('/flashcards', {
        method: 'POST',
        body: { fromQuestionId: questionId },
      });
      setMessage(
        res.created
          ? 'Flashcard criado. Ele aparece amanhã nas suas revisões.'
          : 'Este flashcard já estava nas suas revisões.',
      );
      setState('done');
    } catch (err) {
      setMessage(err instanceof ClientApiError ? err.message : 'Não deu para criar agora.');
      setState('error');
    }
  }
  if (state === 'done') {
    return (
      <p role="status" className="self-center text-sm text-success">
        {message}
      </p>
    );
  }
  return (
    <div className="grid gap-1">
      <Button variant="secondary" size="lg" onClick={create} loading={state === 'pending'}>
        Criar flashcard deste erro
      </Button>
      {state === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
