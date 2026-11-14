// Cores de categoria (tokens.css, --cat-1 a --cat-8). O aluno escolhe uma para cada
// disciplina; os tipos de evento usam as fixas abaixo. Os nomes aparecem no seletor de cor.
export const CATEGORY_COLORS = [
  { id: 1, name: 'Rosa' },
  { id: 2, name: 'Laranja' },
  { id: 3, name: 'Âmbar' },
  { id: 4, name: 'Verde' },
  { id: 5, name: 'Petróleo' },
  { id: 6, name: 'Azul' },
  { id: 7, name: 'Violeta' },
  { id: 8, name: 'Magenta' },
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number]['id'];

/** Cor fixa de cada tipo de evento (SPEC v2, CAL-03 e CAL-15). Aula usa a cor da disciplina. */
export const EVENT_TYPE_COLOR = {
  prova: 1,
  atividade: 3,
  entrega: 3,
  estudo: 4,
  revisao: 4,
  pessoal: 5,
  lazer: 7,
} as const satisfies Record<string, CategoryColor>;

// Classes escritas por inteiro: o Tailwind só gera o que encontra literalmente no código.
const CLASSES: Record<CategoryColor, string> = {
  1: 'bg-cat-1 text-cat-1-fg border-cat-1-line',
  2: 'bg-cat-2 text-cat-2-fg border-cat-2-line',
  3: 'bg-cat-3 text-cat-3-fg border-cat-3-line',
  4: 'bg-cat-4 text-cat-4-fg border-cat-4-line',
  5: 'bg-cat-5 text-cat-5-fg border-cat-5-line',
  6: 'bg-cat-6 text-cat-6-fg border-cat-6-line',
  7: 'bg-cat-7 text-cat-7-fg border-cat-7-line',
  8: 'bg-cat-8 text-cat-8-fg border-cat-8-line',
};

/** Classes do bloco de uma categoria: fundo, texto e cor da borda (some a largura, ex. border-l-4). */
export function categoryClasses(color: CategoryColor) {
  return CLASSES[color];
}
