'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';

// Ações da revisão das peças (Fase 4): enviar o lote à revisão (admin), aprovar ou pedir
// ajuste (revisor) e publicar a aula. As regras ficam no servidor e no banco.

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function call<T>(path: string, body: unknown, ok: (r: T) => string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await api<T>(path, { method: 'POST', body });
      setDone(ok(r));
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para concluir agora.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { call, busy, error, done };
}

export function SendToReviewButton({ batchId, count }: { batchId: string; count: number }) {
  const { call, busy, error, done } = useCall();
  return (
    <div className="grid gap-2">
      <div hidden={count === 0}>
        <Button
          onClick={() =>
            call<{ sent: number; questions: number; skipped: string[] }>(
              `/production/batches/${batchId}/review`,
              {},
              (r) =>
                `${r.sent} ${r.sent === 1 ? 'peça foi' : 'peças foram'} para a revisão, com ${r.questions} ${r.questions === 1 ? 'questão' : 'questões'}.${r.skipped.length ? ` Ficaram de fora (sem uma única alternativa correta): ${r.skipped.join('; ')}.` : ''}`,
            )
          }
          disabled={busy}
        >
          {busy ? 'Enviando…' : `Enviar ${count} ${count === 1 ? 'peça' : 'peças'} para revisão`}
        </Button>
      </div>
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

export function PublishButton({ batchId, count }: { batchId: string; count: number }) {
  const { call, busy, error, done } = useCall();
  return (
    <div className="grid gap-2">
      <div hidden={count === 0}>
        <Button
          onClick={() =>
            call<{ published: number }>(
              `/production/batches/${batchId}/publish`,
              {},
              (r) =>
                `${r.published} ${r.published === 1 ? 'peça publicada' : 'peças publicadas'}. Os alunos já veem a aula.`,
            )
          }
          disabled={busy}
        >
          {busy
            ? 'Publicando…'
            : `Publicar a aula (${count} ${count === 1 ? 'peça aprovada' : 'peças aprovadas'})`}
        </Button>
      </div>
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

type Question = { id: string; stem: string };

export function ReviewDecision({
  taskId,
  questions,
  excerpts,
}: {
  taskId: string;
  questions: Question[];
  /** Trechos que o revisor pode apontar (cenários, questões, narração). */
  excerpts: string[];
}) {
  const approve = useCall();
  const changes = useCall();
  const [discard, setDiscard] = useState<string[]>([]);

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3"
        aria-labelledby="aprovar"
        onSubmit={(e) => {
          e.preventDefault();
          const comment = String(new FormData(e.currentTarget).get('comment') ?? '');
          void approve.call(
            `/production/reviews/${taskId}/approve`,
            { discardQuestions: discard, comment: comment || undefined },
            () => 'Peça aprovada. O selo de demonstração saiu.',
          );
        }}
      >
        <h3 id="aprovar" className="text-lg">
          Aprovar
        </h3>
        {questions.length ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Questões que entram na aula</legend>
            {questions.map((q, i) => (
              <label key={q.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={!discard.includes(q.id)}
                  onChange={(e) =>
                    setDiscard(
                      e.target.checked ? discard.filter((x) => x !== q.id) : [...discard, q.id],
                    )
                  }
                />
                <span>
                  Questão {i + 1}: {q.stem.slice(0, 90)}
                  {q.stem.length > 90 ? '…' : ''}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field label="Observação da aprovação" optional>
          {(p) => <Input {...p} name="comment" maxLength={2000} />}
        </Field>
        <div>
          <Button type="submit" disabled={approve.busy || changes.busy}>
            {approve.busy ? 'Aprovando…' : 'Aprovar peça e questões'}
          </Button>
        </div>
        {approve.done ? <Alert tone="success">{approve.done}</Alert> : null}
        {approve.error ? <Alert tone="danger">{approve.error}</Alert> : null}
      </form>

      <form
        className="grid gap-3 border-t border-line pt-4"
        aria-labelledby="ajuste"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void changes.call(
            `/production/reviews/${taskId}/changes`,
            {
              excerpt: String(f.get('excerpt') ?? '') || undefined,
              comment: String(f.get('comment') ?? ''),
            },
            () => 'Ajuste pedido. A IA gera uma nova versão e a peça volta para esta fila.',
          );
        }}
      >
        <h3 id="ajuste" className="text-lg">
          Pedir ajuste
        </h3>
        <Field label="Trecho" optional hint="Onde está o problema. Em branco: a peça toda.">
          {(p) => (
            <Select {...p} name="excerpt" defaultValue="">
              <option value="">A peça toda</option>
              {excerpts.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Comentário para o ajuste"
          hint="O que está errado e como deve ficar. A IA recebe este texto e corrige a peça."
        >
          {(p) => (
            <Textarea {...p} name="comment" rows={3} required minLength={5} maxLength={2000} />
          )}
        </Field>
        <div>
          <Button type="submit" variant="secondary" disabled={approve.busy || changes.busy}>
            {changes.busy ? 'Enviando…' : 'Pedir ajuste'}
          </Button>
        </div>
        {changes.done ? <Alert tone="success">{changes.done}</Alert> : null}
        {changes.error ? <Alert tone="danger">{changes.error}</Alert> : null}
      </form>
    </div>
  );
}
