import Link from 'next/link';
import { Alert, Badge } from '@/components/ui/card';

// Peças comuns das telas do admin.

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (erro) return <Alert tone="danger">{erro}</Alert>;
  if (ok) return <Alert tone="success">{ok}</Alert>;
  return null;
}

export function AdminHeader({
  title,
  lead,
  crumbs,
  action,
}: {
  title: string;
  lead?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
  action?: React.ReactNode;
}) {
  return (
    <header className="grid gap-2">
      {crumbs?.length ? (
        <nav aria-label="Trilha" className="text-sm">
          {crumbs.map((c) => (
            <span key={c.href}>
              <Link href={c.href}>{c.label}</Link> <span className="text-muted">/</span>{' '}
            </span>
          ))}
          <span aria-current="page">{title}</span>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {action}
      </div>
      {lead ? <p className="max-w-[70ch] text-muted">{lead}</p> : null}
    </header>
  );
}

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'accent' | 'warn' | 'success' | 'danger' }
> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  in_review: { label: 'Em revisão', tone: 'warn' },
  approved: { label: 'Aprovado', tone: 'accent' },
  published: { label: 'Publicado', tone: 'success' },
  archived: { label: 'Arquivado', tone: 'neutral' },
  active: { label: 'Ativa', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warn' },
  rejected: { label: 'Recusada', tone: 'danger' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-5 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

export const tableClass =
  'w-full border-collapse text-left text-[15px] [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-widest [&_th]:text-muted [&_th]:uppercase';
