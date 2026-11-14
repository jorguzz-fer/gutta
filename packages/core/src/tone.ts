// Tom de voz (SPEC v2, 6.2 e 13). Interface e notificações não falam de fracasso, culpa ou
// atraso pessoal, nem leem estado emocional, motivação ou saúde do aluno. A lista vira
// verificação automática: o teste de textos da interface roda isto em cada string.

type Rule = { id: string; pattern: RegExp; hint: string };

const RULES: Rule[] = [
  { id: 'fracasso', pattern: /\bfracass\w*/, hint: 'Descreva o fato e ofereça um caminho.' },
  { id: 'culpa', pattern: /\bculpa(d[oa]s?)?\b/, hint: 'Sem texto de culpa.' },
  {
    id: 'atraso-pessoal',
    pattern: /\b(voce|vc)\s+(esta|ficou|anda)\s+atrasad[oa]|\batraso pessoal\b/,
    hint: 'Fale do planejamento, não da pessoa ("a semana ficou mais ocupada").',
  },
  {
    id: 'cobranca',
    pattern: /\bnao cumpriu\b|\bdescumpri\w*|\bvoce deveria\b|\bvoce precisa estudar mais\b/,
    hint: 'Informe quanto falta e ofereça ajustar ("faltam 3 horas para a sugestão").',
  },
  {
    id: 'estado-emocional',
    pattern:
      /\b(voce|vc)\s+(parece|esta|anda|esta se sentindo|parece estar)\s+(sobrecarregad|desmotivad|cansad|estressad|ansios|trist|deprimid|esgotad|preguicos|desanimad)\w*/,
    hint: 'Não interprete emoção, motivação ou saúde do aluno.',
  },
  {
    id: 'rotulo-pessoal',
    pattern: /\b(preguicos[oa]s?|irresponsave(l|is)|desleixad[oa]s?)\b/,
    hint: 'Sem rótulo sobre a pessoa.',
  },
  {
    id: 'deficit',
    pattern: /\bdeficit\b/,
    hint: 'Sem alerta de déficit; mostre o que dá para fazer.',
  },
];

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

export type ToneIssue = { rule: string; match: string; hint: string };

/** Problemas de tom no texto (vazio: pode usar). Ignora acento, caixa e espaços. */
export function toneIssues(text: string): ToneIssue[] {
  const t = fold(text);
  const out: ToneIssue[] = [];
  for (const r of RULES) {
    const m = r.pattern.exec(t);
    if (m) out.push({ rule: r.id, match: m[0], hint: r.hint });
  }
  return out;
}
