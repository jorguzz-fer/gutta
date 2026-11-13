// Notas e calculadora (SPEC v2, 5.13). Regras puras. Nota pendente não é zero (NOT-09): a
// média atual considera só o que foi lançado. Escala de 0 a 10 (NOT-05); avaliação com outra
// nota máxima é convertida para essa escala.

export type GradingMethod = 'simples' | 'pesos' | 'percentual';

export type GradeItem = {
  id: string;
  /** Nota lançada; null = pendente. */
  grade: number | null;
  maxGrade?: number;
  /** Peso (método por pesos). Padrão 1. */
  weight?: number | null;
  /** Porcentagem da nota final (método percentual). */
  percent?: number | null;
};

const SCALE = 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function share(method: GradingMethod, i: GradeItem): number {
  if (method === 'simples') return 1;
  if (method === 'pesos') return i.weight ?? 1;
  return i.percent ?? 0;
}

const normalized = (i: GradeItem) => ((i.grade ?? 0) / (i.maxGrade || SCALE)) * SCALE;

export type GradeSummary = {
  /** Média das avaliações lançadas; null sem nenhuma. */
  current: number | null;
  graded: number;
  pending: number;
  /** Soma dos pesos (ou porcentagens) lançados e restantes. */
  doneShare: number;
  remainingShare: number;
  /** No percentual: a soma das porcentagens deve ser 100 (NOT-01). */
  percentTotal: number | null;
};

export function gradeSummary(method: GradingMethod, items: GradeItem[]): GradeSummary {
  const done = items.filter((i) => i.grade !== null);
  const doneShare = done.reduce((n, i) => n + share(method, i), 0);
  const totalShare = items.reduce((n, i) => n + share(method, i), 0);
  const current =
    done.length && doneShare > 0
      ? r2(done.reduce((n, i) => n + normalized(i) * share(method, i), 0) / doneShare)
      : null;
  return {
    current,
    graded: done.length,
    pending: items.length - done.length,
    doneShare: r2(doneShare),
    remainingShare: r2(totalShare - doneShare),
    percentTotal: method === 'percentual' ? r2(totalShare) : null,
  };
}

export type NeededGrade =
  | { status: 'garantida'; needed: number }
  | { status: 'alcancavel'; needed: number }
  | { status: 'inalcancavel'; needed: number }
  | { status: 'sem_restantes'; needed: null };

/**
 * "Quanto preciso tirar?" (NOT-11): (média desejada × peso total − Σ nota × peso lançados) ÷
 * peso restante. Exemplo do documento: média 6,5 com peso 6 feito, peso 4 restante, desejada
 * 7,0 → 7,75. Acima da nota máxima: não alcançável; zero ou menos: garantida.
 */
export function neededGrade(input: {
  currentAverage: number;
  doneShare: number;
  remainingShare: number;
  desired: number;
  maxGrade?: number;
}): NeededGrade {
  const max = input.maxGrade ?? SCALE;
  if (input.remainingShare <= 0) return { status: 'sem_restantes', needed: null };
  const total = input.doneShare + input.remainingShare;
  const needed = r2(
    (input.desired * total - input.currentAverage * input.doneShare) / input.remainingShare,
  );
  if (needed <= 0) return { status: 'garantida', needed: 0 };
  if (needed > max) return { status: 'inalcancavel', needed };
  return { status: 'alcancavel', needed };
}

/** Média acumulada depois de cada avaliação lançada, em ordem (NOT-14). */
export function cumulativeAverages(method: GradingMethod, items: GradeItem[]): number[] {
  const out: number[] = [];
  const seen: GradeItem[] = [];
  for (const i of items) {
    if (i.grade === null) continue;
    seen.push(i);
    out.push(gradeSummary(method, seen).current!);
  }
  return out;
}

/** Nota no formato brasileiro, com vírgula: 7,75; 7,0. */
export function formatGrade(n: number): string {
  return (Number.isInteger(n) ? n.toFixed(1) : String(r2(n))).replace('.', ',');
}
