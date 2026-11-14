'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ajuda } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Material = { id: string; title: string; disciplineName: string | null; pages: number };
type Preset = {
  scope: 'aula' | 'slide';
  lessonId?: string;
  materialId?: string;
  page?: number;
  label: string;
};

/*
  Abrir conversa com o tutor (AJU-08): escolher os materiais, ou confirmar a fonte que veio da
  aula ou do slide (AUL-17). A autorização para a IA ler os materiais é pedida uma vez.
*/
export function TutorStart({
  materials,
  preset,
  needsConsent,
  consentText,
}: {
  materials: Material[];
  preset: Preset | null;
  needsConsent: boolean;
  consentText: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!preset && !chosen.size) return setError('Escolha pelo menos um material.');
    if (needsConsent && !consent) return setError('Para continuar, autorize a leitura pela IA.');
    setBusy(true);
    try {
      const t = await api<ajuda.TutorThreadDto>('/ajuda/tutor/threads', {
        method: 'POST',
        body: preset
          ? {
              scope: preset.scope,
              lessonId: preset.lessonId,
              materialId: preset.materialId,
              page: preset.page,
              grantConsent: needsConsent ? consent : undefined,
            }
          : {
              scope: 'materiais',
              materialIds: [...chosen],
              grantConsent: needsConsent ? consent : undefined,
            },
      });
      router.push(`/app/ajuda/tutor/${t.id}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para abrir agora.');
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="nova-conversa">
      <form onSubmit={open} className="grid gap-4">
        <h2 id="nova-conversa" className="text-lg font-semibold">
          Nova conversa
        </h2>
        {preset ? (
          <p>
            Fonte: <strong>{preset.label}</strong>
          </p>
        ) : materials.length === 0 ? (
          <p>
            Você ainda não tem material com o texto lido. Anexe slides ou apostilas em Material de
            estudo e volte aqui.
          </p>
        ) : (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Sobre quais materiais?</legend>
            <ul className="grid gap-2">
              {materials.map((m) => (
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
                        {[m.disciplineName, m.pages ? `${m.pages} páginas` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {needsConsent ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-5 accent-[var(--accent)]"
            />
            <span>{consentText} Autorizo a leitura.</span>
          </label>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div>
          <Button type="submit" disabled={busy || (!preset && materials.length === 0)}>
            {busy ? 'Abrindo…' : 'Abrir conversa'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
