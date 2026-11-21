'use client';
import type { production } from '@gutta/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { ClientApiError, api } from '@/lib/client-api';

type Settings = z.infer<typeof production.MediaSettingsDto>;

export function MediaSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const voices: Record<string, string> = {};
    for (const d of settings.disciplines) {
      const v = String(form.get(`voz-${d.id}`) ?? '').trim();
      if (v) voices[d.id] = v;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/production/settings', {
        method: 'PUT',
        body: { voices, dailyCredits: Number(form.get('cota') ?? 0) },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <Card as="section" aria-labelledby="cota" className="grid gap-3">
        <h2 id="cota" className="text-xl">
          Cota diária
        </h2>
        <Field
          label="Créditos de mídia por dia"
          hint={`Hoje já foram ${settings.spentToday}. Um clipe de 8 s custa 14; uma imagem, 2. Uma aula com 2 vídeos fica entre 150 e 250.`}
        >
          {(p) => (
            <Input
              {...p}
              name="cota"
              type="number"
              min={0}
              max={100000}
              defaultValue={settings.dailyCredits}
              className="max-w-40"
            />
          )}
        </Field>
      </Card>
      <Card as="section" aria-labelledby="vozes" className="grid gap-3">
        <h2 id="vozes" className="text-xl">
          Voz de narração por disciplina
        </h2>
        <p className="text-sm text-muted">
          Cole o id da voz da ElevenLabs (em Voices, “Copy voice ID”). Use uma voz nativa em
          português do Brasil, como a do piloto. Disciplina sem voz usa a voz padrão do servidor, se
          houver.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {settings.disciplines.map((d) => (
            <li key={d.id}>
              <Field label={d.name} optional>
                {(p) => (
                  <Input
                    {...p}
                    name={`voz-${d.id}`}
                    defaultValue={settings.voices[d.id] ?? ''}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={40}
                  />
                )}
              </Field>
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
        {saved ? (
          <p role="status" className="text-sm text-success">
            Salvo.
          </p>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}
