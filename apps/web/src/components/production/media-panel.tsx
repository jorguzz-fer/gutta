'use client';
import type { production } from '@gutta/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';
import type { z } from 'zod';

type Media = z.infer<typeof production.MediaDto>;
type Storyboard = NonNullable<Media['storyboard']>;
type Action = z.input<typeof production.mediaActionBody>;

const FILE_STATUS: Record<
  string,
  { text: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }
> = {
  submitting: { text: 'Enviando', tone: 'accent' },
  pending: { text: 'Gerando', tone: 'accent' },
  ready: { text: 'Pronta', tone: 'success' },
  failed: { text: 'Falhou', tone: 'danger' },
};

function useAction(taskId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(body: Action, label: string) {
    setBusy(label);
    setError(null);
    try {
      await api(`/production/tasks/${taskId}/media`, { method: 'POST', body });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para concluir agora.');
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, error };
}

/**
 * Mídia do vídeo (Fase 3): o admin aprova o roteiro (nada pago ainda), confere as imagens
 * antes de animar (é a animação que custa) e acompanha clipes, narração e montagem.
 */
export function MediaPanel({ taskId, media }: { taskId: string; media: Media }) {
  const { run, busy, error } = useAction(taskId);
  const sb = media.storyboard;
  return (
    <section aria-labelledby="midia" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="midia" className="text-xl">
          Mídia do vídeo
        </h2>
        <p className="text-sm text-muted">
          {media.credits} {media.credits === 1 ? 'crédito' : 'créditos'} de mídia nesta tarefa
        </p>
      </div>
      {media.alert ? (
        <Alert tone={media.stage === 'paused' ? 'danger' : undefined}>
          <p className="whitespace-pre-line">{media.alert}</p>
        </Alert>
      ) : null}
      {media.stage === 'paused' ? (
        <div>
          <Button onClick={() => run({ action: 'resume' }, 'resume')} disabled={Boolean(busy)}>
            {busy === 'resume' ? 'Retomando…' : 'Retomar'}
          </Button>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {media.stage === 'storyboard_review' && sb ? (
        <StoryboardEditor
          storyboard={sb}
          busy={busy}
          onApprove={(storyboard) =>
            run({ action: 'approve_storyboard', storyboard }, 'approve_storyboard')
          }
          onRedo={(note) => run({ action: 'redo_storyboard', note }, 'redo_storyboard')}
        />
      ) : sb ? (
        <Card className="grid gap-3">
          <h3 className="text-lg">Cenas</h3>
          <ol className="grid gap-4">
            {sb.scenes.map((scene, i) => {
              const m = media.scenes.find((x) => x.id === scene.id);
              return (
                <li
                  key={scene.id}
                  className="grid gap-3 border-t border-line pt-3 first:border-0 first:pt-0 md:grid-cols-[18rem_1fr]"
                >
                  <SceneMedia scene={m} index={i} />
                  <div className="grid content-start gap-2 text-sm">
                    <p className="font-semibold">
                      Cena {i + 1} · {scene.id}
                    </p>
                    <p>{scene.narration}</p>
                    {scene.labels.length ? (
                      <p className="text-muted">Rótulos: {scene.labels.join(' · ')}</p>
                    ) : null}
                    {media.stage === 'images_review' ? (
                      <RedoImage
                        prompt={scene.imagePrompt}
                        disabled={Boolean(busy)}
                        onSubmit={(prompt) =>
                          run({ action: 'redo_image', scene: scene.id, prompt }, `redo-${scene.id}`)
                        }
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {media.stage === 'images_review' ? (
            <div className="grid gap-2 border-t border-line pt-3">
              <p className="text-sm text-muted">
                Confira cada imagem antes de animar: anatomia correta, sem texto dentro da imagem, o
                mesmo paciente quando uma cena usa outra como referência. Os clipes custam mais que
                as imagens.
              </p>
              <div>
                <Button
                  onClick={() => run({ action: 'approve_images' }, 'approve_images')}
                  disabled={Boolean(busy)}
                >
                  {busy === 'approve_images' ? 'Liberando…' : 'Aprovar imagens e animar'}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {media.narrationUrl ? (
        <Card className="grid gap-2">
          <h3 className="text-lg">Narração</h3>
          <audio controls preload="none" src={media.narrationUrl} className="w-full">
            <track kind="captions" />
          </audio>
        </Card>
      ) : null}
      {media.videoUrl ? (
        <Card className="grid gap-2">
          <h3 className="text-lg">Vídeo montado</h3>
          <video
            controls
            preload="metadata"
            src={media.videoUrl}
            aria-label="Vídeo montado com narração, legenda e rótulos"
            className="w-full rounded-[var(--radius)] bg-black"
          />
        </Card>
      ) : null}
    </section>
  );
}

function SceneMedia({
  scene,
  index,
}: {
  scene: Media['scenes'][number] | undefined;
  index: number;
}) {
  const file = scene?.clip ?? scene?.image ?? null;
  const st = file ? FILE_STATUS[file.status] : null;
  return (
    <div className="grid content-start gap-1">
      {scene?.clip?.url ? (
        <video
          src={scene.clip.url}
          muted
          loop
          playsInline
          controls
          preload="metadata"
          aria-label={`Clipe da cena ${index + 1}`}
          className="aspect-video w-full rounded border border-line bg-black"
        />
      ) : scene?.image?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket
        <img
          src={scene.image.url}
          alt={`Imagem gerada da cena ${index + 1}`}
          className="aspect-video w-full rounded border border-line bg-surface-2 object-cover"
        />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded border border-line bg-surface-2 text-sm text-muted">
          {file ? 'Gerando…' : 'Aguardando'}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {st ? (
          <Badge tone={st.tone}>{scene?.clip ? `Clipe: ${st.text}` : `Imagem: ${st.text}`}</Badge>
        ) : null}
        {file && file.attempt > 1 ? <span>pedido {file.attempt}</span> : null}
      </div>
      {file?.error ? <p className="text-xs text-danger">{file.error}</p> : null}
    </div>
  );
}

function RedoImage({
  prompt,
  disabled,
  onSubmit,
}: {
  prompt: string;
  disabled: boolean;
  onSubmit: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(prompt);
  if (!open)
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
          Refazer imagem
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <Field
        label="Descrição da imagem"
        hint="Em inglês, realista e sem nenhum texto dentro da imagem. Um novo pedido gasta créditos."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={2000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={disabled || !value.trim()}>
          Pedir nova imagem
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function StoryboardEditor({
  storyboard,
  busy,
  onApprove,
  onRedo,
}: {
  storyboard: Storyboard;
  busy: string | null;
  onApprove: (sb: Storyboard) => void;
  onRedo: (note: string) => void;
}) {
  const [sb, setSb] = useState<Storyboard>(storyboard);
  const [note, setNote] = useState('');
  const set = (i: number, patch: Partial<Storyboard['scenes'][number]>) =>
    setSb({ ...sb, scenes: sb.scenes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-lg">Roteiro para aprovar</h3>
        <p className="text-sm text-muted">
          A narração vira a legenda do vídeo, palavra por palavra: confira os termos técnicos. Nada
          é pago antes desta aprovação.
        </p>
      </div>
      <ol className="grid gap-5">
        {sb.scenes.map((scene, i) => (
          <li
            key={scene.id}
            className="grid gap-3 border-t border-line pt-4 first:border-0 first:pt-0"
          >
            <p className="font-semibold">
              Cena {i + 1} · {scene.id}
              {scene.referenceScene ? (
                <span className="font-normal text-muted">
                  {' '}
                  · usa a imagem de “{scene.referenceScene}”
                </span>
              ) : null}
            </p>
            <Field label={`Narração da cena ${i + 1}`}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={3}
                  maxLength={600}
                  value={scene.narration}
                  onChange={(e) => set(i, { narration: e.target.value })}
                />
              )}
            </Field>
            <Field label={`Imagem da cena ${i + 1}`} hint="Em inglês, sem texto dentro da imagem.">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  maxLength={2000}
                  value={scene.imagePrompt}
                  onChange={(e) => set(i, { imagePrompt: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={`Movimento do clipe da cena ${i + 1}`}>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={1000}
                    value={scene.motionPrompt}
                    onChange={(e) => set(i, { motionPrompt: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label={`Rótulos da cena ${i + 1}`}
                hint="Até 3, separados por ponto e vírgula."
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    value={scene.labels.join('; ')}
                    onChange={(e) =>
                      set(i, {
                        labels: e.target.value
                          .split(';')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      })
                    }
                  />
                )}
              </Field>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button onClick={() => onApprove(sb)} disabled={Boolean(busy)}>
          {busy === 'approve_storyboard' ? 'Liberando…' : 'Aprovar roteiro e gerar imagens'}
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Pedir outro roteiro</summary>
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRedo(note);
          }}
        >
          <Field label="Pedido de ajuste" optional>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          <div>
            <Button type="submit" variant="secondary" disabled={Boolean(busy)}>
              {busy === 'redo_storyboard' ? 'Enviando…' : 'Escrever outro roteiro'}
            </Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
