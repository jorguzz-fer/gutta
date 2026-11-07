// Marca Cognuss: "C" branco com ponto, num quadrado vermelho, + "COGNUSS" em Archivo Black
// na cor da marca (ADR 0010). O quadrado é o mesmo do favicon e aparece nos dois temas.
export function Mark({ className = 'size-[1em]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <rect width="64" height="64" rx="14" fill="#c2181d" />
      <path
        d="M44 21A15 15 0 1 0 44 43"
        fill="none"
        stroke="#fff"
        strokeWidth="8.5"
        strokeLinecap="round"
      />
      <circle cx="45.5" cy="32" r="4.6" fill="#fff" />
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
      <Mark className="size-[0.95em]" />
      <span>
        COGNUSS
        {dot ? <span className={tone === 'cover' ? 'text-accent' : 'text-fg'}>.</span> : null}
      </span>
    </span>
  );
}
