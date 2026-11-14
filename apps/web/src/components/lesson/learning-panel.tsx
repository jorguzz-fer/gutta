'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { lessonStudy } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';
import { DIFFICULTY_LABEL, IMPORTANCE_LABEL } from './labels';
import type { Slide } from './notebook-pane';

type Mark = lessonStudy.MarkDto;
type Progress = lessonStudy.ProgressDto;

const LESSON_DIFFICULTY = [
  ['facil', 'Fácil: compreendi a maior parte'],
  ['moderada', 'Moderada: alguns conceitos pedem revisão'],
  ['dificil', 'Difícil: quero retomar vários conceitos'],
] as const;
const DIFFICULTY_WORD = { facil: 'fácil', moderada: 'moderada', dificil: 'difícil' } as const;
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function Choice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T | null;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([k, label]) => (
          <label
            key={k}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-line px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name={name}
              value={k}
              checked={value === k}
              onChange={() => onChange(k)}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Selos e dúvida do slide aberto (AUL-13 a AUL-16). */
function SlideMarks({
  lessonId,
  slide,
  mark,
  onMark,
}: {
  lessonId: string;
  slide: NonNullable<Slide>;
  mark: Mark | undefined;
  onMark: (m: Mark) => void;
}) {
  const [doubt, setDoubt] = useState(mark?.doubt ?? '');
  const [error, setError] = useState('');
  // A escolha aparece na hora; o servidor confirma em segundo plano.
  const [importance, setImportance] = useState(mark?.importance ?? 'nenhuma');
  const [difficulty, setDifficulty] = useState(mark?.difficulty ?? null);
  const [hasDoubt, setHasDoubt] = useState(
    mark?.doubt !== null && mark?.doubt !== undefined && !mark.doubtResolved,
  );

  async function send(body: Record<string, unknown>) {
    setError('');
    try {
      onMark(
        await api<Mark>('/marks', {
          method: 'POST',
          body: {
            targetType: 'slide',
            lessonId,
            materialId: slide.materialId,
            versionId: slide.versionId,
            page: slide.page,
            ...body,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    }
  }

  return (
    <section aria-labelledby="este-slide" className="grid gap-3">
      <h2 id="este-slide" className="text-lg font-semibold">
        Slide {slide.page}
      </h2>
      <Choice
        legend="Importância"
        name={`imp-${slide.versionId}-${slide.page}`}
        value={importance}
        options={Object.entries(IMPORTANCE_LABEL) as [keyof typeof IMPORTANCE_LABEL, string][]}
        onChange={(v) => {
          setImportance(v);
          void send({ importance: v });
        }}
      />
      <Choice
        legend="Dificuldade"
        name={`dif-${slide.versionId}-${slide.page}`}
        value={difficulty}
        options={Object.entries(DIFFICULTY_LABEL) as [keyof typeof DIFFICULTY_LABEL, string][]}
        onChange={(v) => {
          setDifficulty(v);
          void send({ difficulty: v });
        }}
      />
      <div className="grid gap-2">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={hasDoubt}
            onChange={(e) => {
              setHasDoubt(e.target.checked);
              void send({ doubt: e.target.checked ? doubt.trim() : null });
            }}
            className="size-4 accent-[var(--accent)]"
          />
          <span>Tenho dúvida neste slide</span>
        </label>
        {hasDoubt ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ doubt: doubt.trim() });
            }}
          >
            <label htmlFor={`duvida-${slide.page}`} className="text-sm">
              Qual é a dúvida? (opcional)
            </label>
            <textarea
              id={`duvida-${slide.page}`}
              rows={2}
              maxLength={2000}
              value={doubt}
              onChange={(e) => setDoubt(e.target.value)}
              className="rounded-[var(--radius)] border border-line-strong bg-surface-2 p-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary">
                Guardar a dúvida
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  if (!mark) return;
                  setHasDoubt(false);
                  onMark(
                    await api<Mark>(`/marks/${mark.id}`, {
                      method: 'PATCH',
                      body: { doubtResolved: true },
                    }),
                  );
                }}
              >
                Já resolvi
              </Button>
            </div>
          </form>
        ) : null}
      </div>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}

/** Concluir aula (AUL-18): rápido e opcional, nunca uma prova. */
function Conclude({
  lessonId,
  progress,
  onProgress,
}: {
  lessonId: string;
  progress: Progress;
  onProgress: (p: Progress) => void;
}) {
  const [form, setForm] = useState({
    overallDifficulty: progress.overallDifficulty,
    understoodGoals: progress.understoodGoals,
    hasDoubts: progress.hasDoubts,
    wantsReview: progress.wantsReview,
  });
  const [error, setError] = useState('');
  const save = async (body: Record<string, unknown>) => {
    setError('');
    try {
      onProgress(await api<Progress>(`/lessons/${lessonId}/progress`, { method: 'PUT', body }));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    }
  };
  if (progress.concludedAt)
    return (
      <section aria-labelledby="concluir" className="grid gap-2">
        <h2 id="concluir" className="text-lg font-semibold">
          Aula concluída
        </h2>
        <p className="text-sm">
          Concluída em {DAY.format(new Date(progress.concludedAt))}
          {progress.overallDifficulty
            ? `, com dificuldade ${DIFFICULTY_WORD[progress.overallDifficulty]}`
            : ''}
          .
        </p>
        {progress.wantsReview ? (
          <p className="text-sm">
            Revisão de 30 minutos pedida. Nada entra na sua agenda sem você confirmar.
          </p>
        ) : null}
        <div>
          <Button type="button" variant="ghost" onClick={() => void save({ concluded: false })}>
            Reabrir a aula
          </Button>
        </div>
      </section>
    );
  return (
    <form
      aria-labelledby="concluir"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ ...form, concluded: true });
      }}
    >
      <h2 id="concluir" className="text-lg font-semibold">
        Concluir aula
      </h2>
      <p className="text-sm text-muted">Opcional. Leva menos de um minuto.</p>
      <Choice
        legend="Como foi a dificuldade desta aula?"
        name="dificuldade-aula"
        value={form.overallDifficulty}
        options={LESSON_DIFFICULTY}
        onChange={(v) => setForm({ ...form, overallDifficulty: v })}
      />
      {(
        [
          ['understoodGoals', 'Compreendi os principais objetivos da aula'],
          ['hasDoubts', 'Ainda tenho dúvidas em alguns conteúdos'],
          ['wantsReview', 'Quero uma revisão de 30 minutos'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          <span>{label}</span>
        </label>
      ))}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div>
        <Button type="submit">Concluir aula</Button>
      </div>
    </form>
  );
}

/*
  Painel de aprendizagem (SPEC v2, 5.7): selos do slide, lista de revisão, presença e
  conclusão da aula.
*/
export function LearningPanel({
  lessonId,
  disciplineId,
  slide,
  marks,
  progress,
  pageLabel,
  onMark,
  onProgress,
  onGoTo,
  tutor = false,
}: {
  lessonId: string;
  disciplineId: string;
  /** Ajuda Cognuss ligada: atalhos para o tutor (AUL-17). */
  tutor?: boolean;
  slide: Slide;
  marks: Mark[];
  progress: Progress;
  pageLabel: (m: Mark) => string;
  onMark: (m: Mark) => void;
  onProgress: (p: Progress) => void;
  onGoTo: (m: Mark) => void;
}) {
  const current = slide
    ? marks.find(
        (m) => m.targetType === 'slide' && m.versionId === slide.versionId && m.page === slide.page,
      )
    : undefined;
  const review = marks.filter((m) => m.priority > 0).sort((a, b) => b.priority - a.priority);
  const attend = async (attended: boolean) =>
    onProgress(
      await api<Progress>(`/lessons/${lessonId}/progress`, { method: 'PUT', body: { attended } }),
    );
  return (
    <div className="grid gap-6">
      {slide ? (
        <SlideMarks
          key={`${slide.versionId}-${slide.page}`}
          lessonId={lessonId}
          slide={slide}
          mark={current}
          onMark={onMark}
        />
      ) : null}
      {tutor ? (
        <section aria-labelledby="tutor-aula" className="grid gap-2">
          <h2 id="tutor-aula" className="text-lg font-semibold">
            Tutor
          </h2>
          <p className="text-sm text-muted">
            Pergunte e receba a resposta com a página dos seus materiais. As dúvidas que você marcou
            entram como sugestão.
          </p>
          <div className="flex flex-wrap gap-2">
            {slide ? (
              <Link
                href={`/app/ajuda/tutor?escopo=slide&aula=${lessonId}&material=${slide.materialId}&pagina=${slide.page}`}
                className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-line-strong px-3 text-sm font-semibold no-underline hover:border-accent"
              >
                Perguntar sobre este slide
              </Link>
            ) : null}
            <Link
              href={`/app/ajuda/tutor?escopo=aula&aula=${lessonId}`}
              className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-line-strong px-3 text-sm font-semibold no-underline hover:border-accent"
            >
              Perguntar sobre a aula
            </Link>
          </div>
        </section>
      ) : null}
      <section aria-labelledby="revisar" className="grid gap-2">
        <h2 id="revisar" className="text-lg font-semibold">
          Para revisar
        </h2>
        {review.length === 0 ? (
          <p className="text-sm text-muted">
            Slides marcados como importantes, difíceis ou com dúvida aparecem aqui, na ordem de
            prioridade.
          </p>
        ) : (
          <ol className="grid gap-1">
            {review.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onGoTo(m)}
                  className="min-h-11 w-full rounded-[var(--radius)] px-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="font-semibold">{pageLabel(m)}</span>
                  {' · '}
                  {[
                    m.importance !== 'nenhuma' ? IMPORTANCE_LABEL[m.importance] : null,
                    m.difficulty ? DIFFICULTY_LABEL[m.difficulty] : null,
                    m.doubt !== null && !m.doubtResolved ? 'Dúvida' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby="presenca" className="grid gap-2">
        <h2 id="presenca" className="text-lg font-semibold">
          Presença
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={progress.attended === true ? 'primary' : 'secondary'}
            aria-pressed={progress.attended === true}
            onClick={() => void attend(true)}
          >
            Fui à aula
          </Button>
          <Button
            type="button"
            variant={progress.attended === false ? 'primary' : 'secondary'}
            aria-pressed={progress.attended === false}
            onClick={() => void attend(false)}
          >
            Não fui
          </Button>
        </div>
        {progress.attended === false ? (
          <p className="text-sm">
            Se quiser, <Link href={`/app/faltas/${disciplineId}`}>registre a falta</Link> para
            acompanhar o limite da disciplina.
          </p>
        ) : null}
      </section>
      <Conclude
        key={progress.concludedAt ?? 'aberta'}
        lessonId={lessonId}
        progress={progress}
        onProgress={onProgress}
      />
    </div>
  );
}
