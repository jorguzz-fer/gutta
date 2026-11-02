'use client';
import { BAND_LABEL, type MasteryBand } from '@gutta/core';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingBlock } from '@/components/shared/states';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card, DemoBadge } from '@/components/ui/card';
import { api, ClientApiError } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { CreateFlashcardFromQuestion } from './create-flashcard';

type Option = { id: string; body: string; displayOrder: number };
type Question = {
  id: string;
  stem: string;
  difficulty: number;
  isDemo: boolean;
  topicName: string;
  disciplineName: string;
  options: Option[];
};
type Progress = { answered: number; total: number };
type Next =
  { done: true; progress: Progress } | { done: false; progress: Progress; question: Question };
type Feedback = {
  isCorrect: boolean;
  selectedOptionId: string;
  correctOptionId: string | null;
  options: { id: string; isCorrect: boolean; explanation: string }[];
  sourceRefs: { label: string; url: string | null }[];
  isDemo: boolean;
  mastery: { topicId: string; status: MasteryBand };
  progress: Progress & { finished: boolean };
  nextActions: string[];
};
type Summary = {
  correct: number;
  attempts: { questionId: string; stem: string; isCorrect: boolean }[];
  topics: {
    topicId: string;
    topicName: string;
    band: MasteryBand;
    correct: number;
    total: number;
  }[];
};

const LETTERS = 'ABCDEF';
// No celular a ação principal fica fixa acima da barra de navegação, ao alcance do polegar (Fitts).
const STICKY =
  'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0';

/*
  Player de questões. Uma decisão por tela (Hick): escolher e responder. Feedback imediato com
  a explicação de cada alternativa. Progresso visível (Gradiente de Meta) e um fim cuidado
  (Pico-Fim). Atalhos: 1 a 6 escolhem a alternativa e Enter responde.
*/
export function QuestionPlayer({ sessionId }: { sessionId: string }) {
  const [next, setNext] = useState<Next | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const attemptKey = useRef<string>('');
  const shownAt = useRef<number>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Busca a próxima questão (sem tocar no estado) e só então troca a tela.
  const fetchNext = useCallback(async () => {
    const n = await api<Next>(`/questions/sessions/${sessionId}/next`);
    const sum = n.done ? await api<Summary>(`/questions/sessions/${sessionId}`) : null;
    return { n, sum };
  }, [sessionId]);

  const apply = useCallback(({ n, sum }: { n: Next; sum: Summary | null }) => {
    attemptKey.current = crypto.randomUUID();
    shownAt.current = Date.now();
    setError(null);
    setFeedback(null);
    setSelected(null);
    setSummary(sum);
    setNext(n);
    setAdvancing(false);
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const fail = useCallback((err: unknown) => {
    setError(err as ClientApiError);
    setAdvancing(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchNext()
      .then((d) => alive && apply(d))
      .catch((e) => alive && fail(e));
    return () => {
      alive = false;
    };
  }, [fetchNext, apply, fail]);

  const advance = () => {
    setAdvancing(true);
    fetchNext().then(apply).catch(fail);
  };

  const submit = useCallback(async () => {
    if (!next || next.done || !selected || submitting || feedback) return;
    setSubmitting(true);
    setError(null);
    try {
      const fb = await api<Feedback>('/questions/attempts', {
        method: 'POST',
        body: {
          sessionId,
          questionId: next.question.id,
          selectedOptionId: selected,
          clientAttemptKey: attemptKey.current,
          durationSeconds: Math.round((Date.now() - shownAt.current) / 1000),
        },
      });
      setFeedback(fb);
    } catch (err) {
      // A chave idempotente é mantida: tentar de novo não duplica a resposta.
      setError(err as ClientApiError);
    } finally {
      setSubmitting(false);
    }
  }, [next, selected, submitting, feedback, sessionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!next || next.done || feedback) return;
      if (
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) &&
        e.target.getAttribute('type') !== 'radio'
      )
        return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < next.question.options.length) setSelected(next.question.options[i]!.id);
      if (e.key === 'Enter' && selected) {
        e.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, feedback, selected, submit]);

  if (error && !next) {
    return (
      <ErrorState
        title="Não foi possível carregar a questão"
        action={<Button onClick={advance}>Tentar de novo</Button>}
      >
        {error.message}
      </ErrorState>
    );
  }
  if (!next) return <LoadingBlock label="Carregando questão…" />;

  if (next.done) {
    return <SessionSummary summary={summary} />;
  }

  const q = next.question;
  const answered = feedback ? feedback.progress.answered : next.progress.answered;
  const total = next.progress.total;
  const position = Math.min(next.progress.answered + 1, total);
  const optState = (id: string) => feedback?.options.find((o) => o.id === id);

  return (
    <div className="grid gap-5 pb-24 md:pb-0">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Questão {position} de {total}
          </span>
          <span className="truncate pl-3">{q.topicName}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Progresso da sessão"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(answered / total) * 100}%` }}
          />
        </div>
      </div>

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{q.disciplineName}</Badge>
          {q.isDemo ? <DemoBadge /> : null}
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-sans text-lg leading-snug font-semibold outline-none sm:text-xl"
        >
          {q.stem}
        </h1>
        {feedback ? (
          <div aria-live="polite">
            <Alert tone={feedback.isCorrect ? 'success' : 'neutral'}>
              <strong>{feedback.isCorrect ? 'Você acertou.' : 'Não foi dessa vez.'}</strong>{' '}
              {feedback.isCorrect
                ? 'A explicação continua aí, se quiser conferir o raciocínio.'
                : 'Leia a explicação da correta: é assim que o erro vira aprendizado.'}{' '}
              <span className="text-muted">
                {q.topicName}: {BAND_LABEL[feedback.mastery.status].toLowerCase()}.
              </span>
            </Alert>
          </div>
        ) : null}

        <fieldset disabled={Boolean(feedback) || submitting} className="grid gap-2">
          <legend className="sr-only">Alternativas</legend>
          {q.options.map((o, i) => {
            const st = optState(o.id);
            const isSelected = selected === o.id;
            const showExplanation =
              feedback && (st?.isCorrect || feedback.selectedOptionId === o.id);
            return (
              <div key={o.id} className="grid gap-1">
                <label
                  className={cn(
                    'flex min-h-12 cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-surface p-3 text-[15.5px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]',
                    !feedback && isSelected && 'border-accent bg-accent-soft',
                    !feedback && !isSelected && 'border-line hover:border-line-strong',
                    feedback && st?.isCorrect && 'border-success bg-success-soft',
                    feedback &&
                      !st?.isCorrect &&
                      feedback.selectedOptionId === o.id &&
                      'border-danger bg-danger-soft',
                    feedback &&
                      !st?.isCorrect &&
                      feedback.selectedOptionId !== o.id &&
                      'border-line opacity-80',
                    feedback && 'cursor-default',
                  )}
                >
                  <input
                    type="radio"
                    name="option"
                    value={o.id}
                    checked={feedback ? feedback.selectedOptionId === o.id : isSelected}
                    onChange={() => setSelected(o.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full border font-mono text-sm',
                      isSelected && !feedback
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line-strong',
                      feedback && st?.isCorrect && 'border-success bg-success text-white',
                      feedback &&
                        !st?.isCorrect &&
                        feedback.selectedOptionId === o.id &&
                        'border-danger bg-danger text-white',
                    )}
                  >
                    {feedback && st?.isCorrect ? (
                      <Check className="size-4" />
                    ) : feedback && feedback.selectedOptionId === o.id ? (
                      <X className="size-4" />
                    ) : (
                      LETTERS[i]
                    )}
                  </span>
                  <span className="grid gap-1 pt-0.5">
                    <span>{o.body}</span>
                    {feedback && st?.isCorrect ? (
                      <span className="text-xs font-semibold text-success">Correta</span>
                    ) : null}
                    {feedback && !st?.isCorrect && feedback.selectedOptionId === o.id ? (
                      <span className="text-xs font-semibold text-danger">Sua resposta</span>
                    ) : null}
                  </span>
                </label>
                {showExplanation && st?.explanation ? (
                  <p className="ml-13 px-3 text-[14.5px] text-fg/90">{st.explanation}</p>
                ) : feedback && st?.explanation ? (
                  <details className="ml-13 px-3 text-[14px] text-muted">
                    <summary className="cursor-pointer">Por que não é esta</summary>
                    <p className="mt-1">{st.explanation}</p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {error ? <Alert tone="danger">{error.message} Sua escolha continua marcada.</Alert> : null}

        {!feedback ? (
          <div className={STICKY}>
            <Button size="lg" onClick={submit} disabled={!selected} loading={submitting}>
              Responder
            </Button>
            <span className="hidden text-xs text-muted sm:inline">
              Atalhos: 1 a {q.options.length} e Enter
            </span>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="text-sm text-muted">
              {feedback.sourceRefs.length ? (
                <ul className="grid gap-1">
                  {feedback.sourceRefs.map((r) => (
                    <li key={r.label}>
                      Referência:{' '}
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          {r.label}
                        </a>
                      ) : (
                        r.label
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Sem referência cadastrada
                  {feedback.isDemo
                    ? ': questão de demonstração, ainda sem revisão editorial.'
                    : '.'}
                </p>
              )}
            </div>
            <div className={STICKY}>
              <Button
                key={feedback.progress.finished ? 'fim' : 'proxima'}
                size="lg"
                onClick={advance}
                loading={advancing}
              >
                {feedback.progress.finished ? 'Ver resultado' : 'Próxima questão'}
              </Button>
              {feedback.nextActions.includes('create_flashcard') ? (
                <CreateFlashcardFromQuestion questionId={q.id} />
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SessionSummary({ summary }: { summary: Summary | null }) {
  if (!summary) return <LoadingBlock label="Calculando resultado…" />;
  const total = summary.attempts.length;
  return (
    <div className="grid gap-5">
      <Card className="grid gap-3">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Sessão concluída</p>
        <h1 className="text-3xl font-bold">
          {summary.correct} de {total} {total === 1 ? 'acerto' : 'acertos'}
        </h1>
        <p className="text-muted">
          {summary.correct === total
            ? 'Tudo certo. Os próximos vão ser um pouco mais difíceis.'
            : 'Os erros de hoje voltam amanhã, na hora certa. É assim que fixa.'}
        </p>
      </Card>
      <Card as="section" aria-labelledby="assuntos-sessao">
        <h2 id="assuntos-sessao" className="text-lg font-bold">
          Por assunto
        </h2>
        <ul className="mt-3 grid gap-2">
          {summary.topics.map((t) => (
            <li
              key={t.topicId}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
            >
              <span>{t.topicName}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                {t.correct}/{t.total}
                <Badge
                  tone={t.band === 'firme' ? 'success' : t.band === 'fragil' ? 'warn' : 'neutral'}
                >
                  {BAND_LABEL[t.band]}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Link href="/app" className={buttonClass('primary', 'lg')}>
          Ver o próximo passo
        </Link>
        <Link href="/app/questoes/nova" className={buttonClass('secondary', 'lg')}>
          Mais 5 questões
        </Link>
      </div>
    </div>
  );
}
