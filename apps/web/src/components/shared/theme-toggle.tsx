'use client';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const KEY = 'gutta-theme';
const listeners = new Set<() => void>();
const current = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// Escuro é o padrão. A escolha fica só neste navegador; o script do <head> a aplica antes da pintura.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'dark' as const,
  );
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
  return (
    <button
      type="button"
      onClick={() => {
        if (next === 'light') document.documentElement.dataset.theme = 'light';
        else delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Sem armazenamento: o tema vale só nesta página.
        }
        listeners.forEach((l) => l());
      }}
      aria-label={label}
      title={label}
      className={`inline-grid size-11 place-items-center rounded-[var(--radius)] text-fg hover:bg-surface-2 ${className}`}
    >
      {theme === 'dark' ? (
        <Sun className="size-5" aria-hidden />
      ) : (
        <Moon className="size-5" aria-hidden />
      )}
    </button>
  );
}
