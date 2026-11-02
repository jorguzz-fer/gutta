'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shared/states';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card, DemoBadge } from '@/components/ui/card';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Rating = 0 | 1 | 2 | 3;
type Card = {
  id: string;
  front: string;
  back: string;
  isDemo: boolean;
  personal: boolean;
  topicName: string | null;
  isNew: boolean;
  preview: Record<Rating, string>;
};
type Queue = { cards: Card[]; dueCount: number; newCount: number };

const RATINGS: { r: Rating; label: string; tone: string }[] = [
  { r: 0, label: 'Esqueci', tone: 'border-danger/50 bg-surface hover:bg-danger-soft' },
  { r: 1, label: 'Difícil', tone: 'border-warn/50 bg-surface hover:bg-warn-soft' },
  { r: 2, label: 'Bom', tone: 'border-accent bg-accent text-accent-ink hover:bg-accent-hover' },
  { r: 3, label: 'Fácil', tone: 'border-success/50 bg-surface hover:bg-success-soft' },
];

/*
  Revisão: tentar lembrar, virar, avaliar. A nota mais comum ("Bom") é o destaque (Von Restorff)
  e cada botão mostra quando o cartão volta, antes de escolher. Teclas: espaço vira; 1 a 4 avaliam.
  "Esqueci" devolve o cartão para o fim da fila de hoje.
*/
export function ReviewSession({ moduleId }: { moduleId?: string }) {
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [pending, setPending] = useState(false);
  const keyRef = useRef(crypto.randomUUID());
  const backRef = useRef<HTMLDivElement>(null);

  const fetchQueue = useCallback(
    () => api<Queue>(`/flashcards/due${moduleId ? `?moduleId=${moduleId}` : ''}`),
    [moduleId],
  );

  useEffect(() => {
    let alive = true;
    fetchQueue()
      .then((q) => {
        if (!alive) return;
        setQueue(q.cards);
        setTotal(q.cards.length);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [fetchQueue]);

  const current = queue?.[0];

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || pending) return;
      setPending(true);
      setError(null);
      try {
        await api(`/flashcards/${current.id}/reviews`, {
          method: 'POST',
          body: { rating, clientReviewKey: keyRef.current },
        });
        keyRef.current = crypto.randomUUID();
        setQueue((q) => {
          if (!q) return q;
          const [head, ...rest] = q;
          // Esqueci: volta no fim da fila de hoje (reaprender ainda na mesma sessão).
          return rating === 0 && head
            ? [
                ...rest,
                {
                  ...head,
                  isNew: false,
                  preview: { 0: '10 min', 1: '1 dia', 2: '1 dia', 3: '4 dias' },
                },
              ]
            : rest;
        });
        if (rating !== 0) setDone((d) => d + 1);
        setFlipped(false);
      } catch (err) {
        setError(err as ClientApiError);
      } finally {
        setPending(false);
      }
    },
    [current, pending],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName))
        return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setFlipped(true);
        requestAnimationFrame(() => backRef.current?.focus());
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        void rate((Number(e.key) - 1) as Rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, rate]);

  if (error && !queue) {
    return (
      <ErrorState action={<Button onClick={() => location.reload()}>Tentar de novo</Button>}>
        {error.message}
      </ErrorState>
    );
  }
  if (!queue) return <LoadingBlock label="Carregando revisões…" />;

  if (total === 0) {
    return (
      <EmptyState
        title="Nada para revisar hoje"
        action={
          <Link href="/app/questoes/nova" className={buttonClass('primary')}>
            Resolver 5 questões
          </Link>
        }
      >
        Os cartões aparecem aqui no dia em que vale revisar. Questões que você errar podem virar
        cartões.
      </EmptyState>
    );
  }

  if (!current) {
    return (
      <Card className="grid gap-3">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Revisões em dia</p>
        <h2 className="text-3xl font-bold">
          {done} {done === 1 ? 'cartão revisado' : 'cartões revisados'}
        </h2>
        <p className="text-muted">Cada cartão volta no dia certo. Amanhã tem mais um pouco.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/app" className={buttonClass('primary', 'lg')}>
            Ver o próximo passo
          </Link>
          <Link href="/app/flashcards" className={buttonClass('secondary', 'lg')}>
            Meus cartões
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 pb-28 md:pb-0">
      <div className="grid gap-2">
        <div className="flex justify-between text-sm text-muted">
          <span>
            {done} de {total} revisados
          </span>
          {current.topicName ? <span className="truncate pl-3">{current.topicName}</span> : null}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Progresso das revisões"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      <Card className="grid min-h-64 content-start gap-4">
        <div className="flex flex-wrap gap-2">
          {current.isNew ? <Badge tone="accent">Novo</Badge> : null}
          {current.personal ? <Badge>Seu cartão</Badge> : null}
          {current.isDemo ? <DemoBadge /> : null}
        </div>
        <p className="text-lg leading-snug font-semibold whitespace-pre-line sm:text-xl">
          {current.front}
        </p>
        {flipped ? (
          <div
            ref={backRef}
            tabIndex={-1}
            className="border-t border-line pt-4 whitespace-pre-line outline-none"
            aria-live="polite"
          >
            {current.back}
          </div>
        ) : null}
      </Card>

      {error ? <Alert tone="danger">{error.message}</Alert> : null}

      <div className="glass-bar-mobile fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        {!flipped ? (
          <Button
            key="virar"
            size="lg"
            className="w-full md:w-auto"
            onClick={() => {
              setFlipped(true);
              requestAnimationFrame(() => backRef.current?.focus());
            }}
          >
            Mostrar resposta
          </Button>
        ) : (
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quanto você lembrou?">
            {RATINGS.map(({ r, label, tone }) => (
              <button
                key={r}
                type="button"
                onClick={() => rate(r)}
                disabled={pending}
                className={cn(
                  'grid min-h-14 place-items-center rounded-[var(--radius)] border px-1 py-1.5 text-center font-display text-[15px] font-bold transition-colors disabled:opacity-60',
                  tone,
                )}
              >
                {label}
                <span className="font-sans text-[11.5px] font-normal opacity-80">
                  {current.preview[r]}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 hidden text-xs text-muted md:block">
          Atalhos: espaço vira o cartão; 1 a 4 avaliam.
        </p>
      </div>
    </div>
  );
}
