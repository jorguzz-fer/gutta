'use client';
import { CheckSquare, FileText, Layers, ListChecks, Network, Route } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ajuda } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';
import { cn } from '@/lib/cn';

type Material = {
  id: string;
  title: string;
  type: string;
  pages: number;
  disciplineId: string | null;
  disciplineName: string | null;
};
type Kind = ajuda.JobDto['type'];

const KINDS: [Kind, string, typeof FileText][] = [
  ['resumo', 'Resumo', FileText],
  ['flashcards', 'Flashcards', Layers],
  ['mapa', 'Mapa mental', Network],
  ['roteiro', 'Roteiro de estudo', Route],
  ['questoes', 'Questões', ListChecks],
];
const LEVELS = [
  ['basico', 'Básico'],
  ['intermediario', 'Intermediário'],
  ['avancado', 'Avançado'],
] as const;
const STYLES = [
  ['sintetico', 'Sintético'],
  ['completo', 'Completo'],
  ['esquematizado', 'Esquematizado'],
  ['comparativo', 'Comparativo'],
] as const;
const TYPE_LABEL: Record<string, string> = {
  estudo: 'Material de estudo',
  atividade: 'Atividade',
  prova: 'Prova anterior',
};
const STATUS: Record<ajuda.JobDto['status'], string> = {
  queued: 'Na fila. Começa em instantes.',
  running: 'A IA está lendo os materiais e montando. Costuma levar menos de um minuto.',
  done: 'Pronto.',
  failed: '',
  cancelled: 'Cancelado.',
};

/** Acompanha a geração até terminar (estado visível e cancelamento, ADR 0020). */
function Progress({ job, onReset }: { job: ajuda.JobDto; onReset: () => void }) {
  const router = useRouter();
  const [cur, setCur] = useState(job);
  useEffect(() => {
    if (cur.status === 'done' && cur.resultId) {
      router.push(`/app/ajuda/criacoes/${cur.resultId}`);
      return;
    }
    if (cur.status !== 'queued' && cur.status !== 'running') return;
    const t = setTimeout(async () => {
      try {
        setCur(await api<ajuda.JobDto>(`/ajuda/jobs/${cur.id}`));
      } catch {
        // tenta de novo na próxima volta
        setCur({ ...cur });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [cur, router]);
  const pending = cur.status === 'queued' || cur.status === 'running';
  return (
    <Card as="section" aria-labelledby="gerando" className="grid gap-3">
      <h2 id="gerando" className="text-lg font-semibold">
        {pending ? 'Gerando' : cur.status === 'failed' ? 'Não deu certo desta vez' : 'Geração'}
      </h2>
      <p role="status" aria-live="polite">
        {cur.status === 'failed' ? cur.error : STATUS[cur.status]}
      </p>
      <div className="flex flex-wrap gap-2">
        {pending ? (
          <Button
            type="button"
            variant="secondary"
            onClick={async () =>
              setCur(await api<ajuda.JobDto>(`/ajuda/jobs/${cur.id}/cancel`, { method: 'POST' }))
            }
          >
            Cancelar
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onReset}>
            Voltar ao pedido
          </Button>
        )}
      </div>
    </Card>
  );
}

/*
  Criar com IA (SPEC v2, AJU-01; tela T24): (1) materiais, (2) o que criar, (3) nível,
  (4) instruções. A IA usa primeiro os materiais escolhidos e cita a página de cada trecho.
*/
export function CreateForm({
  materials,
  initialMaterialIds,
  needsConsent,
  consentText,
}: {
  materials: Material[];
  initialMaterialIds: string[];
  needsConsent: boolean;
  consentText: string;
}) {
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState<string>('');
  const [chosen, setChosen] = useState(() => new Set(initialMaterialIds));
  const [kind, setKind] = useState<Kind>('resumo');
  const [level, setLevel] = useState<(typeof LEVELS)[number][0]>('intermediario');
  const [style, setStyle] = useState<(typeof STYLES)[number][0]>('completo');
  const [count, setCount] = useState(10);
  const [instructions, setInstructions] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<ajuda.JobDto | null>(null);

  const disciplines = useMemo(
    () =>
      [
        ...new Map(
          materials.filter((m) => m.disciplineId).map((m) => [m.disciplineId!, m.disciplineName!]),
        ),
      ].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
    [materials],
  );
  const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const shown = materials.filter(
    (m) =>
      (!discipline || m.disciplineId === discipline) &&
      (!query.trim() || fold(`${m.title} ${m.disciplineName ?? ''}`).includes(fold(query.trim()))),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!chosen.size) return setError('Escolha pelo menos um material.');
    if (needsConsent && !consent) return setError('Para continuar, autorize a leitura pela IA.');
    setBusy(true);
    try {
      setJob(
        await api<ajuda.JobDto>('/ajuda/jobs', {
          method: 'POST',
          body: {
            type: kind,
            level,
            style: kind === 'resumo' ? style : undefined,
            count: kind === 'flashcards' || kind === 'questoes' ? count : undefined,
            instructions: instructions.trim() || null,
            materialIds: [...chosen],
            grantConsent: needsConsent ? consent : undefined,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para pedir agora.');
    } finally {
      setBusy(false);
    }
  }

  if (job) return <Progress job={job} onReset={() => setJob(null)} />;

  return (
    <form onSubmit={submit} className="grid gap-6">
      <Card as="section" aria-labelledby="passo-1" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="passo-1" className="text-lg font-semibold">
            1. Selecione seus materiais
          </h2>
          <span className="text-sm text-muted">
            {chosen.size} {chosen.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
        </div>
        {materials.length === 0 ? (
          <p>
            Você ainda não tem material com o texto lido. Anexe slides ou apostilas em Material de
            estudo e volte aqui.
          </p>
        ) : (
          <>
            <label htmlFor="busca-material" className="sr-only">
              Buscar por título ou disciplina
            </label>
            <input
              id="busca-material"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título ou disciplina…"
              className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-4"
            />
            {disciplines.length > 1 ? (
              <div
                role="group"
                aria-label="Filtrar por disciplina"
                className="flex flex-wrap gap-2"
              >
                {[['', 'Todas'] as const, ...disciplines].map(([id, name]) => (
                  <button
                    key={id || 'todas'}
                    type="button"
                    aria-pressed={discipline === id}
                    onClick={() => setDiscipline(id)}
                    className={cn(
                      'min-h-11 rounded-full border px-4 text-sm',
                      discipline === id
                        ? 'border-accent bg-accent-soft font-semibold'
                        : 'border-line',
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            <ul className="grid gap-2" aria-label="Materiais">
              {shown.map((m) => (
                <li key={m.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-line p-3 has-[:checked]:border-accent">
                    <input
                      type="checkbox"
                      checked={chosen.has(m.id)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        setChosen(next);
                      }}
                      className="size-5 accent-[var(--accent)]"
                    />
                    <span className="grid">
                      <span className="font-semibold">{m.title}</span>
                      <span className="text-sm text-muted">
                        {[
                          TYPE_LABEL[m.type] ?? m.type,
                          m.disciplineName,
                          m.pages ? `${m.pages} páginas` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card as="section" aria-labelledby="passo-2" className="grid gap-4">
        <h2 id="passo-2" className="text-lg font-semibold">
          2. O que você deseja criar?
        </h2>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map(([k, label, Icon]) => (
            <label
              key={k}
              className="grid min-h-16 cursor-pointer place-items-center gap-1 rounded-[var(--radius)] border border-line p-3 text-center has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input
                type="radio"
                name="tipo"
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              <Icon className="size-5" aria-hidden />
              <span className="text-sm font-semibold">{label}</span>
            </label>
          ))}
        </div>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">Nível de aprofundamento</legend>
          <div className="flex flex-wrap gap-4">
            {LEVELS.map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="nivel"
                  checked={level === k}
                  onChange={() => setLevel(k)}
                  className="size-5 accent-[var(--accent)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'resumo' ? (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Tipo de resumo</legend>
            <div className="flex flex-wrap gap-4">
              {STYLES.map(([k, label]) => (
                <label key={k} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="estilo"
                    checked={style === k}
                    onChange={() => setStyle(k)}
                    className="size-5 accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {kind === 'flashcards' || kind === 'questoes' ? (
          <label className="grid max-w-xs gap-1 text-sm font-semibold">
            Quantidade
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="min-h-11 rounded-[var(--radius)] border border-line-strong bg-surface-2 px-2 font-normal"
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm font-semibold">
          Instruções adicionais (opcional)
          <textarea
            rows={3}
            maxLength={2000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ex.: priorize os mecanismos e o que o professor destacou."
            className="rounded-[var(--radius)] border border-line-strong bg-surface-2 p-3 font-normal"
          />
        </label>
      </Card>

      {needsConsent ? (
        <Alert>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-5 accent-[var(--accent)]"
            />
            <span>{consentText} Autorizo a leitura.</span>
          </label>
        </Alert>
      ) : null}
      <p className="text-sm text-muted">
        Tudo o que a IA criar fica marcado como gerado por IA, sem revisão editorial, com a página
        de origem de cada trecho.
      </p>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div>
        <Button type="submit" loading={busy} disabled={!materials.length}>
          <CheckSquare className="size-5" aria-hidden /> Preparar com IA
        </Button>
      </div>
    </form>
  );
}
