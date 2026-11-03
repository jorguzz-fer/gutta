// Marca: "GUTTA" em Archivo Black, na cor da marca (protótipo do Lovable, ADR 0007).
// Nome provisório até o INPI (SPEC D01).
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
      className={`font-display tracking-tight ${tone === 'cover' ? 'text-cover-fg' : 'text-accent'} ${className}`}
    >
      GUTTA
      {dot ? <span className={tone === 'cover' ? 'text-accent' : 'text-fg'}>.</span> : null}
    </span>
  );
}
