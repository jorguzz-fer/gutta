'use client';
import { Plus, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { saveQuestionAction, type EditorialState } from '@/features/editorial/actions';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';

type Topic = { id: string; name: string; parentId: string | null; disciplineName: string };
type Opt = { body: string; explanation: string; isCorrect: boolean };
type Src = { citation: string; url: string };
export type QuestionFormValue = {
  id?: string;
  topicId: string;
  stem: string;
  difficulty: number;
  options: Opt[];
  sources: Src[];
};

const LETTERS = 'ABCDEF';
const empty = (): Opt => ({ body: '', explanation: '', isCorrect: false });

/*
  Formulário editorial. A alternativa correta é escolhida por um único rádio (não dá para
  marcar duas), cada alternativa tem o campo de explicação ao lado (Proximidade), e o que falta
  para enviar à revisão aparece antes do envio.
*/
export function QuestionForm({
  topics,
  initial,
}: {
  topics: Topic[];
  initial?: QuestionFormValue;
}) {
  const [state, action, pending] = useActionState<EditorialState, FormData>(
    saveQuestionAction,
    null,
  );
  const [v, setV] = useState<QuestionFormValue>(
    initial ?? {
      topicId: '',
      stem: '',
      difficulty: 2,
      options: [empty(), empty(), empty(), empty()],
      sources: [],
    },
  );
  const set = (patch: Partial<QuestionFormValue>) => setV((cur) => ({ ...cur, ...patch }));
  const setOpt = (i: number, patch: Partial<Opt>) =>
    set({
      options: v.options.map((o, j) =>
        j === i ? { ...o, ...patch } : patch.isCorrect ? { ...o, isCorrect: false } : o,
      ),
    });
  const missing = [
    !v.options.some((o) => o.isCorrect) && 'marcar a correta',
    v.options.some((o) => !o.explanation.trim()) && 'explicar todas as alternativas',
  ].filter(Boolean);

  const groups = topics.reduce<Record<string, Topic[]>>((acc, t) => {
    (acc[t.disciplineName] ??= []).push(t);
    return acc;
  }, {});

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="id" value={v.id ?? ''} />
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({ ...v, sources: v.sources.filter((x) => x.citation.trim()) })}
      />
      {state?.errors?.length ? (
        <Alert tone="danger">
          <ul className="ml-4 list-disc">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Assunto">
          {(p) => (
            <Select
              {...p}
              value={v.topicId}
              onChange={(e) => set({ topicId: e.target.value })}
              required
            >
              <option value="">Escolha…</option>
              {Object.entries(groups).map(([disc, ts]) => (
                <optgroup key={disc} label={disc}>
                  {ts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.parentId ? '— ' : ''}
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Dificuldade" hint="1 fácil · 5 difícil">
          {(p) => (
            <Select
              {...p}
              value={v.difficulty}
              onChange={(e) => set({ difficulty: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="Enunciado">
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            value={v.stem}
            onChange={(e) => set({ stem: e.target.value })}
            required
          />
        )}
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">
          Alternativas (2 a 6). Marque a correta e explique cada uma.
        </legend>
        {v.options.map((o, i) => (
          <Card key={i} as="div" className={cn('grid gap-2 p-4', o.isCorrect && 'border-success')}>
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex min-h-11 items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="correct"
                  checked={o.isCorrect}
                  onChange={() => setOpt(i, { isCorrect: true })}
                  className="size-5 accent-[var(--success)]"
                />
                {LETTERS[i]}{' '}
                {o.isCorrect ? <span className="text-sm text-success">· correta</span> : null}
              </label>
              {v.options.length > 2 ? (
                <Button
                  variant="ghost"
                  aria-label={`Remover alternativa ${LETTERS[i]}`}
                  onClick={() => set({ options: v.options.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            <Textarea
              aria-label={`Texto da alternativa ${LETTERS[i]}`}
              rows={2}
              value={o.body}
              onChange={(e) => setOpt(i, { body: e.target.value })}
              placeholder="Texto da alternativa"
            />
            <Textarea
              aria-label={`Explicação da alternativa ${LETTERS[i]}`}
              rows={2}
              value={o.explanation}
              onChange={(e) => setOpt(i, { explanation: e.target.value })}
              placeholder={o.isCorrect ? 'Por que esta é a correta' : 'Por que esta está errada'}
            />
          </Card>
        ))}
        {v.options.length < 6 ? (
          <Button
            variant="secondary"
            className="justify-self-start"
            onClick={() => set({ options: [...v.options, empty()] })}
          >
            <Plus className="size-4" aria-hidden /> Alternativa
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">
          Referências (recomendado antes de publicar)
        </legend>
        {v.sources.map((src, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              aria-label={`Citação ${i + 1}`}
              placeholder="Citação (autor, obra, edição, página)"
              value={src.citation}
              onChange={(e) =>
                set({
                  sources: v.sources.map((x, j) =>
                    j === i ? { ...x, citation: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              aria-label={`Link ${i + 1}`}
              placeholder="https:// (opcional)"
              value={src.url}
              onChange={(e) =>
                set({
                  sources: v.sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                })
              }
            />
            <Button
              variant="ghost"
              aria-label={`Remover referência ${i + 1}`}
              onClick={() => set({ sources: v.sources.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={() => set({ sources: [...v.sources, { citation: '', url: '' }] })}
        >
          <Plus className="size-4" aria-hidden /> Referência
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending}>
          Salvar rascunho
        </Button>
        {missing.length ? (
          <span className="text-sm text-muted">
            Para enviar à revisão, falta {missing.join(' e ')}.
          </span>
        ) : null}
      </div>
    </form>
  );
}
