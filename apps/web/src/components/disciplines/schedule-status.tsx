'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { disciplines } from '@gutta/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { api, ClientApiError } from '@/lib/client-api';

type Import = NonNullable<disciplines.DisciplineDto['scheduleImport']>;

/** A leitura ainda está andando: a tela consulta de novo de tempos em tempos. */
export const isPending = (i: Import | null) =>
  i?.status === 'waiting_file' || i?.status === 'extracting';

/*
  Estado da leitura do cronograma no cartão da disciplina (SPEC v2, DIS-05). Sem autorização,
  explica o que vai para a IA e pede; pronta, leva à conferência (no cadastro, a conferência
  do próprio cadastro, para as aulas já entrarem na rotina, ROT-02).
*/
export function ScheduleStatus({
  value,
  reviewBase,
  onChanged,
}: {
  value: Import;
  /** Caminho da tela de conferência; o id da leitura vai no fim. */
  reviewBase: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function retry(grantConsent: boolean) {
    setBusy(true);
    setError('');
    try {
      await api(`/schedule-imports/${value.id}/retry`, { method: 'POST', body: { grantConsent } });
      await onChanged();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  switch (value.status) {
    case 'waiting_file':
    case 'extracting':
      body = <p>Lendo o cronograma. Isso costuma levar menos de um minuto.</p>;
      break;
    case 'needs_consent':
      body = (
        <>
          <p>
            Para montar as aulas e as provas a partir do cronograma, a IA precisa ler o arquivo. O
            conteúdo vai para a Anthropic (o modelo de IA) e para a Voyage AI (a busca por assunto),
            ambas nos EUA; nome, e-mail e CPF não vão. Você confere tudo antes de entrar na agenda e
            pode desligar em Privacidade.
          </p>
          <div>
            <Button type="button" disabled={busy} onClick={() => retry(true)}>
              Autorizar a leitura
            </Button>
          </div>
        </>
      );
      break;
    case 'ready':
      body = (
        <div className="flex flex-wrap items-center gap-2">
          <p>O cronograma foi lido.</p>
          <Link href={`${reviewBase}/${value.id}`} className={buttonClass('primary', 'md')}>
            Conferir o cronograma
          </Link>
        </div>
      );
      break;
    case 'confirmed':
      body = <p>Cronograma conferido e na agenda.</p>;
      break;
    case 'failed':
      body = (
        <>
          <p>{value.error ?? 'Não foi possível ler o cronograma.'}</p>
          <div>
            <Button
              type="button"

              variant="secondary"
              disabled={busy}
              onClick={() => retry(false)}
            >
              Tentar de novo
            </Button>
          </div>
        </>
      );
      break;
    default:
      return null;
  }
  return (
    <div className="grid gap-2 text-sm" aria-live="polite">
      {body}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
