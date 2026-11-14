'use client';
import { useEffect, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Item = z.infer<typeof lessonStudy.annotationHistory.response>['items'][number];

const REASON: Record<string, string> = {
  copia: 'Cópia automática',
  conflito: 'Substituída por outro aparelho',
  'antes de recuperar': 'Antes de uma recuperação',
  'antes de reassociar': 'Antes de trazer da versão anterior',
};
const WHEN = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const plural = (n: number) => `${n} ${n === 1 ? 'marcação' : 'marcações'}`;

/*
  Histórico das marcações de uma página (AUL-12): cópias automáticas e versões substituídas
  por outro aparelho. Recuperar guarda a atual no histórico, então nada some.
*/
export function HistoryDialog({
  materialId,
  versionId,
  page,
  open,
  onClose,
  onRestored,
}: {
  materialId: string;
  versionId: string;
  page: number;
  open: boolean;
  onClose: () => void;
  onRestored: (a: lessonStudy.AnnotationDto) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      ref.current?.close?.();
      return;
    }
    ref.current?.showModal?.();
    let alive = true;
    api<{ items: Item[] }>(
      `/materials/${materialId}/annotations/${page}/history?versionId=${versionId}`,
    )
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setError('Não deu para carregar o histórico agora.'));
    return () => {
      alive = false;
    };
  }, [open, materialId, versionId, page]);

  async function restore(id: string) {
    setError('');
    try {
      onRestored(
        await api<lessonStudy.AnnotationDto>(`/annotation-history/${id}/restore`, {
          method: 'POST',
        }),
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para recuperar agora.');
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="historico-titulo"
      onClose={onClose}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      {open ? (
        <div className="grid gap-4 p-5">
          <h2 id="historico-titulo" className="text-xl font-semibold">
            Histórico do slide {page}
          </h2>
          {items === null && !error ? <p aria-live="polite">Carregando…</p> : null}
          {items?.length === 0 ? (
            <p>
              Sem versões anteriores ainda. Guardamos uma cópia a cada 10 minutos de edição e sempre
              que outro aparelho grava por cima.
            </p>
          ) : null}
          {items?.length ? (
            <ul className="grid gap-2">
              {items.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
                >
                  <span className="text-sm">
                    <span className="font-semibold">{WHEN.format(new Date(h.savedAt))}</span>
                    {' · '}
                    {REASON[h.reason] ?? h.reason} · {plural(h.shapes)}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => void restore(h.id)}>
                    Recuperar
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div>
            <Button type="button" variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
