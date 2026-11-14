'use client';
import { useEffect, useRef, useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Plan = z.infer<typeof lessonStudy.reassociation.response>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/*
  Troca de versão (AUL-25): as marcações ficam na versão em que foram feitas. A plataforma
  sugere a página nova mais parecida; o aluno confirma ou muda. O que ficar sem par continua
  guardado na versão anterior.
*/
export function ReassociateDialog({
  materialId,
  pageCount,
  open,
  onClose,
  onDone,
}: {
  materialId: string;
  pageCount: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pairs, setPairs] = useState<Record<number, number | null>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      ref.current?.close?.();
      return;
    }
    ref.current?.showModal?.();
    let alive = true;
    api<Plan>(`/materials/${materialId}/reassociation`)
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        setPairs(Object.fromEntries(p.pages.map((x) => [x.from, x.to])));
      })
      .catch(() => alive && setError('Não deu para carregar a sugestão agora.'));
    return () => {
      alive = false;
    };
  }, [open, materialId]);

  const chosen = Object.entries(pairs).filter(([, to]) => to !== null) as [string, number][];
  const repeated = new Set(chosen.map(([, to]) => to)).size !== chosen.length;

  async function confirm() {
    if (!plan?.fromVersionId) return;
    setBusy(true);
    setError('');
    try {
      await api(`/materials/${materialId}/reassociation`, {
        method: 'POST',
        body: {
          fromVersionId: plan.fromVersionId,
          pairs: chosen.map(([from, to]) => ({ from: Number(from), to })),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para levar agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="reassociar-titulo"
      onClose={onClose}
      className="w-[min(36rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      {open ? (
        <div className="grid gap-4 p-5">
          <h2 id="reassociar-titulo" className="text-xl font-semibold">
            Levar suas marcações para a versão nova
          </h2>
          {plan ? (
            <p className="text-sm">
              Suas marcações estão na versão {plan.fromVersion}. Sugerimos a página mais parecida da
              versão {plan.toVersion}; confira e mude se precisar.
            </p>
          ) : null}
          {plan?.pages.length ? (
            <ul className="grid gap-2">
              {plan.pages.map((p) => (
                <li key={p.from} className="grid gap-1 sm:grid-cols-[1fr_12rem] sm:items-center">
                  <label htmlFor={`par-${p.from}`} className="text-sm">
                    <span className="font-semibold">Página {p.from}</span>
                    {' ('}
                    {[
                      p.shapes ? plural(p.shapes, 'marcação', 'marcações') : null,
                      p.notes ? plural(p.notes, 'nota', 'notas') : null,
                      p.marks ? plural(p.marks, 'selo', 'selos') : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {')'}
                  </label>
                  <select
                    id={`par-${p.from}`}
                    value={pairs[p.from] ?? ''}
                    onChange={(e) =>
                      setPairs({
                        ...pairs,
                        [p.from]: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2"
                  >
                    <option value="">Deixar na versão anterior</option>
                    {Array.from({ length: pageCount }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Página {i + 1}
                        {p.to === i + 1 ? ' (sugerida)' : ''}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          ) : plan ? (
            <p>Nada a levar.</p>
          ) : (
            <p aria-live="polite">Comparando as versões…</p>
          )}
          {repeated ? (
            <Alert role="alert">Cada página nova recebe uma página antiga só.</Alert>
          ) : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!chosen.length || repeated || busy}
              loading={busy}
              onClick={() => void confirm()}
            >
              Levar para a versão nova
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Agora não
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
