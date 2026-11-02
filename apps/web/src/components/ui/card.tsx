import { cn } from '@/lib/cn';

// Um contêiner por unidade de informação (Região Comum).
export function Card({
  className,
  as: Tag = 'section',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'li' }) {
  return (
    <Tag
      className={cn('rounded-[var(--radius-lg)] border border-line bg-surface p-5', className)}
      {...rest}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'success';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11.5px] tracking-wide uppercase',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

// Selo obrigatório em conteúdo sem revisão editorial (ADR 0005).
export function DemoBadge() {
  return (
    <Badge tone="warn" title="Conteúdo de demonstração, ainda sem revisão editorial">
      Demonstração · sem revisão
    </Badge>
  );
}

export function Alert({
  tone = 'neutral',
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'neutral' | 'danger' | 'success' | 'warn' }) {
  const tones = {
    neutral: 'bg-surface-2 border-line',
    danger: 'bg-danger-soft border-danger/40',
    success: 'bg-success-soft border-success/40',
    warn: 'bg-warn-soft border-warn/40',
  } as const;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-[var(--radius)] border px-4 py-3 text-sm', tones[tone], className)}
      {...rest}
    />
  );
}
