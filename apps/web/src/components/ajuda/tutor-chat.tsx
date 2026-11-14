'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ajuda } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';
import { AI_SEAL } from './creation-view';

type Thread = ajuda.TutorThreadDto;
const SCOPE_LABEL = { materiais: 'Materiais', aula: 'Aula', slide: 'Slide' } as const;

/*
  Conversa com o tutor (AJU-08, AJU-09, AUL-17). Cada resposta traz as páginas usadas, com
  link para o material na página, e o selo de IA. As dúvidas da aula viram sugestões.
*/
export function TutorChat({ thread: initial }: { thread: Thread }) {
  const [thread, setThread] = useState(initial);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    setError('');
    if (message.length < 3) return setError('Escreva sua dúvida.');
    setPending(message);
    setText('');
    try {
      setThread(
        await api<Thread>(`/ajuda/tutor/threads/${thread.id}/messages`, {
          method: 'POST',
          body: { message },
        }),
      );
    } catch (err) {
      setText(message);
      setError(err instanceof ClientApiError ? err.message : 'Não deu para perguntar agora.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl md:text-3xl">{thread.title}</h1>
          <Badge>{SCOPE_LABEL[thread.scope]}</Badge>
        </div>
        {thread.sourceTitles.length ? (
          <p className="text-sm text-muted">Fonte: {thread.sourceTitles.join(', ')}</p>
        ) : (
          <p className="text-sm text-muted">
            Nenhum material com texto lido nesta fonte. O tutor vai dizer que não tem de onde
            responder.
          </p>
        )}
      </div>

      <section aria-label="Mensagens" className="grid gap-3">
        {thread.messages.length === 0 && !pending ? (
          <p className="text-muted">
            Pergunte o que ficou difícil. A resposta vem dos seus materiais.
          </p>
        ) : null}
        {thread.messages.map((m) =>
          m.role === 'user' ? (
            <div
              key={m.id}
              className="justify-self-end rounded-[var(--radius)] bg-accent-soft px-4 py-2 md:max-w-[80%]"
            >
              <span className="sr-only">Você: </span>
              <p className="whitespace-pre-line">{m.content}</p>
            </div>
          ) : (
            <Card as="article" key={m.id} aria-label="Resposta do tutor" className="grid gap-2">
              <p className="text-xs text-muted">{AI_SEAL}</p>
              <p className="whitespace-pre-line">{m.content}</p>
              {m.citations.length ? (
                <div className="grid gap-1 text-sm">
                  <span className="font-semibold">Páginas usadas</span>
                  <ul className="flex flex-wrap gap-2">
                    {m.citations.map((c) => (
                      <li key={c.ref}>
                        {c.materialId ? (
                          <Link href={`/app/materiais/${c.materialId}?pagina=${c.page}`}>
                            [{c.ref}] {c.label}
                          </Link>
                        ) : (
                          `[${c.ref}] ${c.label}`
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ),
        )}
        {pending ? (
          <>
            <div className="justify-self-end rounded-[var(--radius)] bg-accent-soft px-4 py-2 md:max-w-[80%]">
              <span className="sr-only">Você: </span>
              <p className="whitespace-pre-line">{pending}</p>
            </div>
            <p role="status" className="text-sm text-muted">
              O tutor está lendo seus materiais…
            </p>
          </>
        ) : null}
      </section>

      {thread.doubts.length ? (
        <section aria-labelledby="duvidas" className="grid gap-2">
          <h2 id="duvidas" className="text-lg font-semibold">
            Suas dúvidas registradas
          </h2>
          <ul className="flex flex-wrap gap-2">
            {thread.doubts.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => {
                    setText(d);
                    input.current?.focus();
                  }}
                  className="min-h-11 rounded-full border border-line px-4 text-left text-sm hover:border-accent"
                >
                  {d}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={ask} className="grid gap-2">
        <label htmlFor="pergunta" className="font-semibold">
          Sua pergunta
        </label>
        <textarea
          id="pergunta"
          ref={input}
          rows={3}
          maxLength={1500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-[var(--radius)] border border-line-strong bg-surface-2 p-3"
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">
            {thread.remaining} de {thread.dailyLimit} perguntas nas próximas 24 horas
          </span>
          <Button type="submit" disabled={Boolean(pending) || thread.remaining === 0}>
            Perguntar
          </Button>
        </div>
      </form>
    </div>
  );
}
