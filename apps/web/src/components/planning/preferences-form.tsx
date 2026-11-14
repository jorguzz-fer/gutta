'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { planning } from '@gutta/contracts';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { ClientApiError, api } from '@/lib/client-api';

type Prefs = planning.PreferencesDto;

function Radios<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-1 border-t border-line pt-4 first:border-0 first:pt-0">
      <legend className="mb-2 font-semibold">{legend}</legend>
      {options.map(([k, label]) => (
        <label key={String(k)} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="radio"
            name={name}
            checked={value === k}
            onChange={() => onChange(k)}
            className="size-5 accent-[var(--accent)]"
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Minutes({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <p id={`${id}-dica`} className="text-sm text-muted">
        {hint}
      </p>
      <select
        id={id}
        aria-describedby={`${id}-dica`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="min-h-11 max-w-xs rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
      >
        <option value="">Sem limite próprio</option>
        {[30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200].map((m) => (
          <option key={m} value={m}>
            {m < 60 ? `${m} min` : `${m / 60} h`.replace('.', ',')}
          </option>
        ))}
      </select>
    </div>
  );
}

/*
  Preferências do Equilíbrio (SPEC v2, EQU-01 a EQU-04; tela T06). Os padrões vêm da SPEC e da
  seção 6.4. São escolhas de organização, não recomendação de saúde (EQU-04).
*/
export function PreferencesForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const set = (patch: Partial<Prefs>) => setP({ ...p, ...patch });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      setP(await api<Prefs>('/planning/preferences', { method: 'PUT', body: p }));
      setMsg({ tone: 'success', text: 'Preferências salvas. A próxima proposta já usa estas.' });
      router.refresh();
    } catch (err) {
      setMsg({
        tone: 'danger',
        text: err instanceof ClientApiError ? err.message : 'Não deu para salvar agora.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid max-w-2xl gap-6">
      <Radios
        legend="Em qual período você prefere estudar?"
        name="periodo"
        value={p.preferredPeriod}
        options={[
          ['manha', 'Manhã'],
          ['tarde', 'Tarde'],
          ['noite', 'Noite'],
          ['varia', 'Minha disponibilidade varia'],
        ]}
        onChange={(preferredPeriod) => set({ preferredPeriod })}
      />
      <Radios
        legend="Qual duração de sessão você prefere?"
        name="duracao"
        value={p.sessionMinutes}
        options={[
          [20, '20 minutos'],
          [30, '30 minutos'],
          [45, '45 minutos'],
          [60, '60 minutos'],
        ]}
        onChange={(sessionMinutes) => set({ sessionMinutes })}
      />
      <Radios
        legend="Como você gostaria que o Cognuss planejasse sua rotina?"
        name="intensidade"
        value={p.intensity}
        options={[
          ['leve', 'Leve: só o essencial (usa até metade dos seus horários de estudo)'],
          ['equilibrada', 'Equilibrada: estudo e tempo livre (até três quartos)'],
          ['intensiva', 'Intensiva: quando eu pedir (pode usar todos)'],
        ]}
        onChange={(intensity) => set({ intensity })}
      />
      <Radios
        legend="O que priorizar?"
        name="prioridade"
        value={p.priority}
        options={[
          ['bem_estar', 'Meu bem-estar: espalhar pelos dias'],
          ['avaliacoes', 'Avaliações próximas'],
          ['dificuldade', 'Conteúdos com maior dificuldade'],
          ['distribuicao', 'Distribuição equilibrada entre disciplinas'],
        ]}
        onChange={(priority) => set({ priority })}
      />

      <fieldset className="grid gap-4 border-t border-line pt-4">
        <legend className="mb-2 font-semibold">Limites de estudo extraclasse</legend>
        <Minutes
          id="limite-dia"
          label="Por dia"
          hint="O máximo que o plano pode propor num dia."
          value={p.dailyLimitMinutes}
          onChange={(dailyLimitMinutes) => set({ dailyLimitMinutes })}
        />
        <Minutes
          id="limite-semana"
          label="Por semana"
          hint="O máximo da semana, somando o que já está confirmado."
          value={p.weeklyLimitMinutes}
          onChange={(weeklyLimitMinutes) => set({ weeklyLimitMinutes })}
        />
      </fieldset>

      <fieldset className="grid gap-4 border-t border-line pt-4">
        <legend className="mb-2 font-semibold">Pausas e sequência</legend>
        <div className="grid gap-1">
          <label htmlFor="pausa" className="font-semibold">
            Pausa entre sessões seguidas
          </label>
          <select
            id="pausa"
            value={p.breakMinutes}
            onChange={(e) => set({ breakMinutes: Number(e.target.value) })}
            className="min-h-11 max-w-xs rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
          >
            {[5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="seguidas" className="font-semibold">
            Sessões seguidas antes de uma pausa maior
          </label>
          <select
            id="seguidas"
            value={p.maxConsecutive}
            onChange={(e) => set({ maxConsecutive: Number(e.target.value) })}
            className="min-h-11 max-w-xs rounded-[var(--radius)] border border-line-strong bg-surface-2 px-3"
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={p.avoidAfterLongJourney}
            onChange={(e) => set({ avoidAfterLongJourney: e.target.checked })}
            className="size-5 accent-[var(--accent)]"
          />
          <span>Evitar sessão logo depois de quatro horas ou mais de aula seguidas</span>
        </label>
      </fieldset>

      <p className="text-sm text-muted">
        Estes valores são escolhas de organização do plano, não recomendações de saúde. Você muda
        quando quiser.
      </p>
      {msg ? (
        <Alert tone={msg.tone} role={msg.tone === 'danger' ? 'alert' : 'status'}>
          {msg.text}
        </Alert>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          Salvar preferências
        </Button>
      </div>
    </form>
  );
}
