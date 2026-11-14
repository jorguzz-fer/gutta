// Acompanhar Aula (SPEC v2, 5.7; ADR 0015): regras puras de selos, revisão, troca de versão e
// do texto do caderno. Nada aqui faz I/O.

export type Importance = 'nenhuma' | 'importante' | 'alta';
export type Difficulty = 'facil' | 'moderado' | 'dificil';

export type MarkLike = {
  importance: Importance;
  difficulty: Difficulty | null;
  /** Nulo: sem dúvida. Texto vazio: dúvida sem texto. */
  doubt: string | null;
  doubtResolved?: boolean;
};

const IMPORTANCE_WEIGHT: Record<Importance, number> = { nenhuma: 0, importante: 2, alta: 3 };
const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { facil: 0, moderado: 1, dificil: 2 };

/**
 * Prioridade de revisão de um slide ou trecho (AUL-21): importante e difícil vem antes de fácil
 * e sem destaque. Dúvida em aberto soma. Zero significa "não precisa entrar na revisão".
 */
export function reviewPriority(m: MarkLike): number {
  const importance = IMPORTANCE_WEIGHT[m.importance];
  const difficulty = m.difficulty ? DIFFICULTY_WEIGHT[m.difficulty] : 0;
  const doubt = m.doubt !== null && !m.doubtResolved ? 2 : 0;
  // O produto destaca o que é importante E difícil, acima da soma das partes.
  return importance + difficulty + doubt + importance * difficulty;
}

/** Lista de revisão (AUL-20): só o que tem prioridade, da maior para a menor. */
export function reviewList<T extends MarkLike>(marks: T[]): (T & { priority: number })[] {
  return marks
    .map((m) => ({ ...m, priority: reviewPriority(m) }))
    .filter((m) => m.priority > 0)
    .sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------------------------
// Troca de versão (AUL-25)

export type PageText = { page: number; text: string };
export type PageMatch = { from: number; to: number | null; score: number };

function words(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/**
 * Sugere, para cada página da versão antiga, a página mais parecida da versão nova, pelo texto.
 * Cada página nova recebe no máximo uma antiga; os pares mais parecidos escolhem primeiro.
 * Páginas sem texto (só imagem) ficam com a mesma posição, se existir e estiver livre, com
 * nota baixa. Abaixo do mínimo, a página antiga fica sem par (o aluno decide).
 */
export function matchPages(oldPages: PageText[], newPages: PageText[], min = 0.3): PageMatch[] {
  const oldW = new Map(oldPages.map((p) => [p.page, words(p.text)]));
  const newW = new Map(newPages.map((p) => [p.page, words(p.text)]));
  const pairs: { from: number; to: number; score: number }[] = [];
  for (const [from, a] of oldW)
    for (const [to, b] of newW) {
      const score = similarity(a, b);
      if (score >= min) pairs.push({ from, to, score });
    }
  // Empate: preferir a mesma posição.
  pairs.sort((x, y) => y.score - x.score || Math.abs(x.from - x.to) - Math.abs(y.from - y.to));
  const taken = new Set<number>();
  const result = new Map<number, PageMatch>();
  for (const p of pairs) {
    if (result.has(p.from) || taken.has(p.to)) continue;
    result.set(p.from, { from: p.from, to: p.to, score: Math.round(p.score * 100) / 100 });
    taken.add(p.to);
  }
  for (const p of oldPages) {
    if (result.has(p.page)) continue;
    const textless = (oldW.get(p.page)?.size ?? 0) === 0;
    const same = newW.get(p.page);
    if (textless && same && same.size === 0 && !taken.has(p.page)) {
      result.set(p.page, { from: p.page, to: p.page, score: 0.1 });
      taken.add(p.page);
    } else {
      result.set(p.page, { from: p.page, to: null, score: 0 });
    }
  }
  return [...result.values()].sort((a, b) => a.from - b.from);
}

// ---------------------------------------------------------------------------------------------
// Caderno: formatação leve escrita como texto (ADR 0015). Vira blocos que a interface desenha
// como elementos, sem HTML.

export type Inline =
  { type: 'text'; text: string } | { type: 'bold'; text: string } | { type: 'math'; tex: string };

export type NoteBlock =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'math'; tex: string };

/** Negrito com `**` e fórmula com `$...$`. O resto é texto. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\$([^$\n]+?)\$/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] });
    else out.push({ type: 'math', tex: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(l);
const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Blocos do caderno: parágrafos (linhas seguidas), listas com `- ` ou `1. `, tabelas com `|`
 * (a segunda linha `|---|` separa o cabeçalho) e fórmula em bloco com `$$`.
 */
export function parseNote(text: string): NoteBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('$$')) {
      const body: string[] = [];
      let rest = line.trim().slice(2);
      // $$ ... $$ na mesma linha
      if (rest.trim().endsWith('$$') && rest.trim().length >= 2) {
        blocks.push({ type: 'math', tex: rest.trim().slice(0, -2).trim() });
        i++;
        continue;
      }
      if (rest.trim()) body.push(rest);
      i++;
      while (i < lines.length && !lines[i]!.trim().endsWith('$$')) body.push(lines[i++]!);
      if (i < lines.length) {
        rest = lines[i]!.trim().slice(0, -2);
        if (rest.trim()) body.push(rest);
        i++;
      }
      blocks.push({ type: 'math', tex: body.join('\n').trim() });
      continue;
    }
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i]!)) rows.push(lines[i++]!);
      const hasHeader = rows.length > 1 && isDivider(rows[1]!);
      const body = rows.filter((_, k) => !(hasHeader && k === 1)).map(cells);
      blocks.push({
        type: 'table',
        header: hasHeader ? body[0]! : [],
        rows: hasHeader ? body.slice(1) : body,
      });
      continue;
    }
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    if (ul || ol) {
      const ordered = !ul;
      const re = ordered ? OL : UL;
      const items: Inline[][] = [];
      for (let m = re.exec(lines[i] ?? ''); i < lines.length && m; m = re.exec(lines[i] ?? '')) {
        items.push(parseInline(m[1]!));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !isTableRow(lines[i]!) &&
      !UL.test(lines[i]!) &&
      !OL.test(lines[i]!) &&
      !lines[i]!.trim().startsWith('$$')
    )
      para.push(lines[i++]!);
    blocks.push({ type: 'paragraph', content: parseInline(para.join('\n')) });
  }
  return blocks;
}
