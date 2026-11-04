// Marca: gota branca + "GUTTA" em Archivo Black, na cor da marca (protótipo do Lovable, ADR 0007).
// A gota vai num quadrado vermelho, igual ao favicon: branca sozinha some no tema claro.
// Nome provisório até o INPI (SPEC D01).
export function Drop({ className = 'size-[1em]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <rect width="64" height="64" rx="14" fill="#c2181d" />
      <path fill="#fff" d="M32 9C32 9 15 29 15 39a17 17 0 0 0 34 0C49 29 32 9 32 9z" />
    </svg>
  );
}

export function Wordmark({
  className = 'text-2xl',
  dot = false,
  tone = 'accent',
}: {
  className?: string;
  dot?: boolean;
  tone?: 'accent' | 'cover';
}) {
  return (
    <span
      className={`inline-flex items-center gap-[0.3em] font-display leading-none tracking-tight ${tone === 'cover' ? 'text-cover-fg' : 'text-accent'} ${className}`}
    >
      <Drop className="size-[0.95em]" />
      <span>
        GUTTA
        {dot ? <span className={tone === 'cover' ? 'text-accent' : 'text-fg'}>.</span> : null}
      </span>
    </span>
  );
}
