'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ajuda } from '@gutta/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Creation = ajuda.CreationDto;
type Question = ajuda.QuestionDto;
/* eslint-disable @typescript-eslint/no-explicit-any -- conteúdo vem validado pelo esquema do tipo no servidor */
type Content = Record<string, any>;

export const AI_SEAL = 'Gerado por IA a partir dos seus materiais · sem revisão editorial';
const STAGE: Record<string, string> = {
  pre_requisito: 'Pré-requisito',
  essencial: 'Essencial',
  aprofundamento: 'Aprofundamento',
  revisao: 'Revisão',
};
const DIFF: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

/** Páginas de origem de um trecho (IA-2): levam ao material, na página. */
function Refs({ refs, sources }: { refs?: string[]; sources: Creation['sources'] }) {
  if (!refs?.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((r) => {
        const s = sources.find((x) => x.ref === r);
        if (!s) return null;
        return s.materialId ? (
          <Link
            key={r}
            href={`/app/materiais/${s.materialId}?pagina=${s.page}`}
            className="rounded-full border border-line px-2 text-xs no-underline hover:border-accent"
            title={s.label}
          >
            {s.label}
          </Link>
        ) : (
          <span key={r} className="rounded-full border border-line px-2 text-xs">
            {s.label}
          </span>
        );
      })}
    </span>
  );
}

/** Questão gerada (MEM-03): o gabarito e o comentário só chegam depois da resposta (IA-9). */
function QuestionCard({ q, sources }: { q: Question; sources: Creation['sources'] }) {
  const [cur, setCur] = useState(q);
  const [chosen, setChosen] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const a = cur.answer;
  async function answer(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setCur(
        await api<Question>(`/ajuda/questions/${q.id}/attempts`, {
          method: 'POST',
          body: q.kind === 'objetiva' ? { chosenIndex: chosen } : { answerText: text },
        }),
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para responder agora.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      <Card as="article" className="grid gap-3">
        <p className="font-semibold">
          {q.position}. {q.stem}
        </p>
        <p className="text-sm text-muted">
          {q.kind === 'objetiva' ? 'Objetiva' : 'Discursiva'} · {DIFF[q.difficulty] ?? q.difficulty}
          <Refs refs={q.refs} sources={sources} />
        </p>
        {a ? (
          <div className="grid gap-2">
            {q.kind === 'objetiva' ? (
              <ol className="grid gap-1">
                {q.options.map((o, i) => (
                  <li
                    key={i}
                    className={
                      i === a.correctIndex
                        ? 'rounded-[var(--radius)] border border-success/60 bg-success-soft p-2'
                        : i === a.chosenIndex
                          ? 'rounded-[var(--radius)] border border-danger/60 bg-danger-soft p-2'
                          : 'p-2'
                    }
                  >
                    {String.fromCharCode(97 + i)}) {o}
                    {i === a.correctIndex
                      ? ' (resposta)'
                      : i === a.chosenIndex
                        ? ' (sua escolha)'
                        : ''}
                  </li>
                ))}
              </ol>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-semibold">Sua resposta:</span> {a.answerText}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Resposta esperada:</span> {a.expected}
                </p>
              </>
            )}
            {a.correct !== null ? (
              <p role="status" className="font-semibold">
                {a.correct ? 'Você acertou.' : 'Não foi desta vez.'}
              </p>
            ) : null}
            <p className="text-sm">{a.comment}</p>
          </div>
        ) : (
          <form onSubmit={answer} className="grid gap-2">
            {q.kind === 'objetiva' ? (
              <fieldset className="grid gap-1">
                <legend className="sr-only">Alternativas da questão {q.position}</legend>
                {q.options.map((o, i) => (
                  <label key={i} className="flex min-h-11 cursor-pointer items-start gap-2 p-1">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={chosen === i}
                      onChange={() => setChosen(i)}
                      className="mt-1 size-5 accent-[var(--accent)]"
                    />
                    <span>
                      {String.fromCharCode(97 + i)}) {o}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="grid gap-1 text-sm">
                Sua resposta
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2"
                />
              </label>
            )}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div>
              <Button
                type="submit"
                variant="secondary"
                loading={busy}
                disabled={q.kind === 'objetiva' ? chosen === null : !text.trim()}
              >
                Responder
              </Button>
            </div>
          </form>
        )}
      </Card>
    </li>
  );
}

function Body({
  c,
  editing,
  draft,
  setDraft,
}: {
  c: Creation;
  editing: boolean;
  draft: Content;
  setDraft: (d: Content) => void;
}) {
  const k = (editing ? draft : c.content) as Content;
  const src = c.sources;
  const field = 'w-full rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2';
  if (c.type === 'resumo')
    return (
      <div className="grid gap-5">
        {(k.sections ?? []).map((sec: any, si: number) => (
          <section key={si} className="grid gap-2">
            <h2 className="text-xl font-semibold">{sec.heading}</h2>
            <ul className="grid list-disc gap-2 pl-6">
              {(sec.points ?? []).map((p: any, pi: number) => (
                <li key={pi}>
                  {editing ? (
                    <textarea
                      aria-label={`Trecho ${pi + 1} de ${sec.heading}`}
                      className={field}
                      rows={2}
                      value={p.text}
                      onChange={(e) => {
                        const next = structuredClone(draft);
                        next.sections[si].points[pi].text = e.target.value;
                        setDraft(next);
                      }}
                    />
                  ) : (
                    <>
                      {p.text}
                      <Refs refs={p.refs} sources={src} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {k.keyConcepts?.length ? (
          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">Conceitos fundamentais</h2>
            <dl className="grid gap-2">
              {k.keyConcepts.map((x: any, i: number) => (
                <div key={i}>
                  <dt className="font-semibold">{x.term}</dt>
                  <dd>
                    {x.explanation}
                    <Refs refs={x.refs} sources={src} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {k.complement?.length ? (
          <section
            aria-labelledby="complemento"
            className="grid gap-2 rounded-[var(--radius)] border border-dashed border-line-strong p-3"
          >
            <h2 id="complemento" className="font-semibold">
              Complemento: não está nos seus materiais
            </h2>
            <ul className="grid list-disc gap-1 pl-6 text-sm">
              {k.complement.map((x: any, i: number) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  if (c.type === 'flashcards')
    return (
      <div className="grid gap-3">
        <p className="text-sm">
          Estes cartões já estão na sua <Link href="/app/revisoes">revisão espaçada</Link>.
        </p>
        <ul className="grid gap-2">
          {(k.cards ?? []).map((x: any, i: number) => (
            <li key={i}>
              {editing ? (
                <div className="grid gap-2 rounded-[var(--radius)] border border-line p-3">
                  <textarea
                    aria-label={`Frente do cartão ${i + 1}`}
                    className={field}
                    rows={2}
                    value={x.front}
                    onChange={(e) => {
                      const next = structuredClone(draft);
                      next.cards[i].front = e.target.value;
                      setDraft(next);
                    }}
                  />
                  <textarea
                    aria-label={`Verso do cartão ${i + 1}`}
                    className={field}
                    rows={2}
                    value={x.back}
                    onChange={(e) => {
                      const next = structuredClone(draft);
                      next.cards[i].back = e.target.value;
                      setDraft(next);
                    }}
                  />
                </div>
              ) : (
                <details className="rounded-[var(--radius)] border border-line p-3">
                  <summary className="cursor-pointer font-semibold">{x.front}</summary>
                  <p className="mt-2">
                    {x.back}
                    <Refs refs={x.refs} sources={src} />
                  </p>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  if (c.type === 'questoes')
    return (
      <ol className="grid gap-3">
        {c.questions.map((q) => (
          <QuestionCard key={q.id} q={q} sources={src} />
        ))}
      </ol>
    );
  if (c.type === 'mapa') {
    const names = new Map<string, string>((k.nodes ?? []).map((n: any) => [n.id, n.label]));
    return (
      <div className="grid gap-4">
        <p>
          Conceito central: <strong>{k.central}</strong>
        </p>
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Conceitos</h2>
          <ul className="grid gap-2">
            {(k.nodes ?? []).map((n: any) => (
              <li key={n.id}>
                <strong>{n.label}</strong>
                {n.detail ? `: ${n.detail}` : ''}
                <Refs refs={n.refs} sources={src} />
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Relações</h2>
          <ul className="grid gap-1">
            {(k.edges ?? []).map((e: any, i: number) => (
              <li key={i}>
                {names.get(e.from)} <span className="text-muted">→ {e.relation} →</span>{' '}
                {names.get(e.to)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
  return (
    <ol className="grid gap-3">
      {(k.steps ?? []).map((st: any, i: number) => (
        <li key={i}>
          <Card className="grid gap-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {i + 1}. {st.title} <Badge tone="neutral">{STAGE[st.stage] ?? st.stage}</Badge>
            </p>
            <p>
              {st.description}
              <Refs refs={st.refs} sources={src} />
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** Acompanha a regeneração e recarrega quando termina. */
function Regenerating({ job, onDone }: { job: ajuda.JobDto; onDone: (j: ajuda.JobDto) => void }) {
  const [cur, setCur] = useState(job);
  useEffect(() => {
    if (cur.status !== 'queued' && cur.status !== 'running') {
      onDone(cur);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setCur(await api<ajuda.JobDto>(`/ajuda/jobs/${cur.id}`));
      } catch {
        setCur({ ...cur });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [cur, onDone]);
  return <Alert role="status">A IA está gerando de novo a partir dos mesmos materiais…</Alert>;
}

/*
  Uma criação (SPEC v2, AJU-02 a AJU-06, AJU-10 a AJU-12; IA-2, IA-3, IA-6, IA-8): conteúdo
  com a página de origem de cada trecho, o selo de IA, e editar, regenerar, excluir, exportar.
*/
export function CreationView({ creation: c }: { creation: Creation }) {
  const router = useRouter();
  const [title, setTitle] = useState(c.title);
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Content>(() => structuredClone(c.content));
  const [job, setJob] = useState<ajuda.JobDto | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const k = c.content as Content;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({
        tone: 'danger',
        text: err instanceof ClientApiError ? err.message : 'Não deu agora.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {renaming ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(`/ajuda/creations/${c.id}`, { method: 'PATCH', body: { title } });
                setRenaming(false);
                router.refresh();
              });
            }}
          >
            <label className="grid flex-1 gap-1 text-sm font-semibold">
              Nome
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3 font-normal"
              />
            </label>
            <Button type="submit" variant="secondary" loading={busy}>
              Salvar nome
            </Button>
          </form>
        ) : (
          <h1 className="text-3xl md:text-4xl">{c.title}</h1>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone="warn">{AI_SEAL}</Badge>
          {c.disciplineName ? <span>{c.disciplineName}</span> : null}
          {c.edited ? <span>Editado por você</span> : null}
        </div>
      </div>

      {c.stale ? (
        <Alert>
          Você acrescentou material novo nesta disciplina depois desta criação. Se quiser, gere de
          novo para incluir.
        </Alert>
      ) : null}
      {c.warnings.map((w) => (
        <Alert key={w}>{w}</Alert>
      ))}
      {k.notCovered ? <Alert>O material não cobre: {k.notCovered}</Alert> : null}
      {job ? (
        <Regenerating
          job={job}
          onDone={(j) => {
            setJob(null);
            if (j.status === 'failed')
              setMsg({ tone: 'danger', text: j.error ?? 'Não deu certo.' });
            router.refresh();
          }}
        />
      ) : null}
      {msg ? (
        <Alert tone={msg.tone} role={msg.tone === 'danger' ? 'alert' : 'status'}>
          {msg.text}
        </Alert>
      ) : null}

      <Body c={c} editing={editing} draft={draft} setDraft={setDraft} />

      <section aria-labelledby="fontes" className="grid gap-2">
        <h2 id="fontes" className="text-lg font-semibold">
          Fontes usadas
        </h2>
        <ul className="grid gap-1 text-sm">
          {c.sources.map((x) => (
            <li key={x.ref}>
              {x.materialId ? (
                <Link href={`/app/materiais/${x.materialId}?pagina=${x.page}`}>{x.label}</Link>
              ) : (
                x.label
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {editing ? (
          <>
            <Button
              type="button"
              loading={busy}
              onClick={() =>
                run(async () => {
                  await api(`/ajuda/creations/${c.id}`, {
                    method: 'PATCH',
                    body: { content: draft },
                  });
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              Salvar alterações
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            {c.type === 'resumo' || c.type === 'flashcards' ? (
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                Editar
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setRenaming(true)}>
              Renomear
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || Boolean(job)}
              onClick={() =>
                run(async () =>
                  setJob(
                    await api<ajuda.JobDto>(`/ajuda/creations/${c.id}/regenerate`, {
                      method: 'POST',
                    }),
                  ),
                )
              }
            >
              Gerar de novo
            </Button>
            <a
              href={`/api/v1/ajuda/creations/${c.id}/export?formato=texto`}
              className={buttonClass('ghost', 'md')}
            >
              Baixar em texto
            </a>
            {c.type === 'flashcards' ? (
              <a
                href={`/api/v1/ajuda/creations/${c.id}/export?formato=anki`}
                className={buttonClass('ghost', 'md')}
              >
                Baixar para o Anki
              </a>
            ) : null}
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm('Excluir esta criação? Os flashcards gerados por ela saem junto.')
                )
                  return;
                void run(async () => {
                  await api(`/ajuda/creations/${c.id}`, { method: 'DELETE' });
                  router.push('/app/ajuda/criacoes');
                });
              }}
            >
              Excluir
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
