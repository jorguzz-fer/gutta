'use client';
import { Sparkles } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { askTutorAction, type TutorState } from '@/features/tutor/actions';
import { cn } from '@/lib/cn';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

/*
  Conversa com o tutor no módulo. A pergunta vai por server action; a página re-renderiza com
  a conversa gravada. Avisos visíveis: só usa o material do módulo, não atende caso real e a
  conversa fica guardada.
*/
export function TutorChat({
  moduleId,
  path,
  messages,
  available,
  remaining,
  dailyLimit,
}: {
  moduleId: string;
  path: string;
  messages: Msg[];
  available: boolean;
  remaining: number;
  dailyLimit: number;
}) {
  const [state, action, pending] = useActionState<TutorState, FormData>(askTutorAction, null);
  const form = useRef<HTMLFormElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state && !state.error) form.current?.reset();
  }, [state]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, pending]);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Pergunte sobre este módulo. O tutor usa só o material publicado aqui e as questões que você
        já respondeu; não orienta casos reais. As conversas ficam guardadas e podem ser revistas
        pela equipe.
      </p>
      {messages.length ? (
        <ol
          className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1"
          aria-label="Conversa com o tutor"
        >
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                'max-w-[90%] rounded-[var(--radius)] px-4 py-3 text-[15px] whitespace-pre-wrap',
                m.role === 'user'
                  ? 'justify-self-end bg-accent-soft'
                  : 'justify-self-start border border-line bg-surface-2',
              )}
            >
              <span className="sr-only">{m.role === 'user' ? 'Você: ' : 'Tutor: '}</span>
              {m.content}
            </li>
          ))}
        </ol>
      ) : null}
      <div ref={end} aria-hidden />
      <div aria-live="polite" className="text-sm">
        {pending ? (
          <span className="flex items-center gap-2 text-muted">
            <Sparkles className="size-4 animate-pulse" aria-hidden /> O tutor está pensando…
          </span>
        ) : state?.error ? (
          <Alert tone="danger">{state.error}</Alert>
        ) : null}
      </div>
      {available ? (
        <form ref={form} action={action} className="grid gap-2">
          <input type="hidden" name="moduleId" value={moduleId} />
          <input type="hidden" name="path" value={path} />
          <label htmlFor="tutor-msg" className="text-sm font-medium">
            Sua dúvida
          </label>
          <textarea
            id="tutor-msg"
            name="message"
            required
            minLength={3}
            maxLength={1500}
            rows={3}
            disabled={pending || remaining === 0}
            className="w-full rounded-[var(--radius)] border border-line-strong bg-surface-2 px-4 py-2 text-base focus:border-accent"
            placeholder="Por que o sopro aumenta na manobra de Valsalva?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || remaining === 0} loading={pending}>
              Perguntar ao tutor
            </Button>
            <span className="text-xs text-muted">
              {remaining} de {dailyLimit} perguntas restantes nas próximas 24 horas
            </span>
          </div>
        </form>
      ) : (
        <Alert>O tutor está desligado no momento. O resumo e as questões continuam aqui.</Alert>
      )}
    </div>
  );
}
