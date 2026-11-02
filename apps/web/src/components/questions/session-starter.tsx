'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingBlock } from '@/components/shared/states';
import { Button, buttonClass } from '@/components/ui/button';
import { api, ClientApiError } from '@/lib/client-api';

type Params = {
  mode?: string;
  moduleId?: string;
  disciplineId?: string;
  topicIds?: string[];
  questionId?: string;
  count?: number;
};

// Cria a sessão ao abrir a página (não num GET de servidor, para prefetch não criar sessões).
export function SessionStarter({ params }: { params: Params }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<ClientApiError | null>(null);

  async function start() {
    setError(null);
    try {
      const res = await api<{ sessionId: string }>('/questions/sessions', {
        method: 'POST',
        body: params,
      });
      router.replace(`/app/questoes/sessao/${res.sessionId}`);
    } catch (err) {
      setError(
        err instanceof ClientApiError ? err : new ClientApiError(0, 'error', 'Algo deu errado.'),
      );
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error?.code === 'no_content') {
    return (
      <ErrorState
        title="Ainda não há questões aqui"
        action={
          <Link href="/app/disciplinas" className={buttonClass('secondary')}>
            Ver disciplinas
          </Link>
        }
      >
        {error.message}
      </ErrorState>
    );
  }
  if (error) {
    return (
      <ErrorState action={<Button onClick={start}>Tentar de novo</Button>}>
        {error.message}
      </ErrorState>
    );
  }
  return <LoadingBlock label="Separando suas questões…" />;
}
