import { cn } from '@/lib/cn';

// Matizes das capas, todos nos tons de vermelho e brasa da marca. A escolha é estável por slug.
const HUES = [27, 18, 35, 10, 42, 22];
export function coverHue(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

/*
  Capa no estilo do protótipo (ADR 0007): degradê no matiz da disciplina, rótulo em caixa alta
  e título em Archivo Black. Texto claro sobre a capa escura nos dois temas (--cover-*).
*/
export function Cover({
  slug,
  eyebrow,
  title,
  className,
  children,
}: {
  slug: string;
  eyebrow?: string;
  title: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'course-cover relative flex aspect-video flex-col justify-end overflow-hidden rounded-[var(--radius)] p-4 shadow-card',
        className,
      )}
      style={{ '--course-hue': coverHue(slug) } as React.CSSProperties}
    >
      <span aria-hidden className="absolute top-3 left-4 font-display text-xs text-cover-fg/80">
        G
      </span>
      {eyebrow ? (
        <p className="text-[11px] font-semibold tracking-widest text-cover-muted uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="text-lg leading-tight text-cover-fg sm:text-xl">{title}</h3>
      {children}
    </div>
  );
}
