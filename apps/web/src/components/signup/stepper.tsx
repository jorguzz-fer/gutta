import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SIGNUP_STEPS, type SignupProgress, type SignupStep } from '@/features/signup/steps';

// Indicador de etapas (CAD-09): concluídas com marca, a atual em destaque. Números e nomes
// sempre visíveis, para não depender só de cor.
export function Stepper({ progress, current }: { progress: SignupProgress; current: SignupStep }) {
  return (
    <nav aria-label="Etapas do cadastro">
      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {SIGNUP_STEPS.map((s, i) => {
          const done = progress[s.key];
          const active = s.key === current;
          return (
            <li
              key={s.key}
              className="flex items-center gap-2"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full border text-xs font-semibold',
                  active
                    ? 'border-accent bg-accent text-accent-ink'
                    : done
                      ? 'border-success text-success'
                      : 'border-line-strong text-muted',
                )}
              >
                {done && !active ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn(active ? 'font-semibold text-fg' : 'text-muted')}>
                {s.label}
                {done && !active ? <span className="sr-only"> (concluída)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
