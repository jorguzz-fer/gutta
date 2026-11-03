import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

// Um primário por tela (Von Restorff). Altura mínima de 44 px para toque (Fitts).
// Cantos retos e texto em Hind semibold, como no protótipo do Lovable (ADR 0007).
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-line-strong',
  ghost: 'bg-transparent text-accent hover:bg-accent-soft',
  danger: 'bg-surface text-danger border border-danger/60 hover:bg-danger-soft',
};
const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold no-underline',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-55',
    variants[variant],
    sizes[size],
    extra,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
