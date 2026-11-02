'use client';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';

type Look = 'classic' | 'glass';
const KEY = 'gutta-look';
const listeners = new Set<() => void>();

function current(): Look {
  return document.documentElement.dataset.look === 'glass' ? 'glass' : 'classic';
}

function apply(look: Look) {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // Navegador sem armazenamento: a escolha vale só nesta página.
  }
  if (look === 'glass') document.documentElement.dataset.look = 'glass';
  else delete document.documentElement.dataset.look;
  listeners.forEach((l) => l());
}

const options: { value: Look; label: string; hint: string }[] = [
  { value: 'classic', label: 'Clássico', hint: 'O visual padrão do Gutta.' },
  { value: 'glass', label: 'Vidro', hint: 'Experimental: superfícies translúcidas.' },
];

// Escolha do visual guardada só neste navegador. É um experimento, não uma preferência da conta.
export function LookSwitch() {
  const look = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'classic' as Look,
  );
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Visual</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius)] border px-4 py-3',
              look === o.value ? 'border-accent bg-accent-soft' : 'border-line-strong',
            )}
          >
            <input
              type="radio"
              name="look"
              value={o.value}
              checked={look === o.value}
              onChange={() => apply(o.value)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="grid">
              <span className="font-medium">{o.label}</span>
              <span className="text-sm text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
