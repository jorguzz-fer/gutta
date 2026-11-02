// Gota do Gutta. Marca provisória até o INPI (SPEC D01).
export function Drop({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path fill="var(--accent)" d="M32 4C32 4 10 30 10 42a22 22 0 0 0 44 0C54 30 32 4 32 4z" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-lg font-bold">
      <Drop />
      Gutta
    </span>
  );
}
