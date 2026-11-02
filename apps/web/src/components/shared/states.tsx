import { cn } from '@/lib/cn';

// Estados que toda tela precisa ter: vazio com próximo passo, erro recuperável e carregando.
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-6">
      <h3 className="text-lg font-bold">{title}</h3>
      {children ? <div className="max-w-prose text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Algo deu errado',
  children,
  action,
}: {
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-3 rounded-[var(--radius-lg)] border border-danger/40 bg-danger-soft p-6"
    >
      <h3 className="text-lg font-bold">{title}</h3>
      {children ? <div className="max-w-prose">{children}</div> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

export function LoadingBlock({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
