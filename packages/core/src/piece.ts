import { PIECE_BASE_CSS } from './piece-base';

// Peças interativas da produção de aulas (docs/producao/ESPECIFICACAO.md, "Padrão de peça
// aprovado"; ADR 0021). A peça é guardada em blocos (título, estilo, corpo, script e rodapé) e
// montada na hora de servir, com a mesma base do piloto: cabeçalho com a marca, tokens,
// fontes e rodapé. O selo "Demonstração · sem revisão" vem do banco, nunca do HTML gerado.

export type PieceBlocks = {
  title: string;
  style: string;
  body: string;
  script: string;
  /** Rodapé próprio; sem ele, vale o da aula (fonte bibliográfica). */
  foot?: string | null;
};

export type PieceContext = {
  /** "Fisiologia endócrina · Aula 1 · Introdução". */
  crumb: string;
  /** Rodapé padrão da aula, com a fonte bibliográfica (HTML simples). */
  foot: string;
  /** Selo de demonstração (controlado pelo banco). */
  demo: boolean;
  /** Tema fixo para prévia e teste; sem ele, segue o sistema e o botão do cabeçalho. */
  theme?: 'light' | 'dark' | null;
  /** @font-face das fontes (PIECE_FONT_CSS, de @gutta/core/piece-fonts). */
  fontCss?: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const MARK =
  '<svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#c2181d"/><path d="M44 21A15 15 0 1 0 44 43" fill="none" stroke="#fff" stroke-width="8.5" stroke-linecap="round"/><circle cx="45.5" cy="32" r="4.6" fill="#fff"/></svg>';

// Ajudantes que toda peça do piloto usa ($, $$, css, clamp, ss, reduce) e o botão de tema, que
// chama window.onTheme para a peça redesenhar canvas e SVG com as cores novas.
const PRELUDE = `const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#themeBtn').onclick=()=>{const r=document.documentElement,cur=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.dataset.theme=cur==='dark'?'light':'dark';window.onTheme&&window.onTheme()};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{window.onTheme&&window.onTheme()});`;

/** Monta o HTML final da peça, autocontido. */
export function assemblePiece(b: PieceBlocks, ctx: PieceContext): string {
  const theme = ctx.theme ? ` data-theme="${ctx.theme}"` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"${theme}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.title.trim())}</title>
<style>${ctx.fontCss ?? ''}
${PIECE_BASE_CSS}
${b.style}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <span class="brand">${MARK}COGNUSS</span>
    <span class="crumb">${esc(ctx.crumb)}</span>
    <span class="sp"></span>
    ${ctx.demo ? '<span class="badge">Demonstração · sem revisão</span>' : ''}
    <button class="ibtn" id="themeBtn" type="button">Alternar tema</button>
  </header>
${b.body}
  <p class="foot">${b.foot?.trim() || ctx.foot}</p>
</div>
<script>
${PRELUDE}
${b.script}
</script>
</body>
</html>
`;
}

/**
 * Rodapé padrão da aula: o aviso do piloto e a referência bibliográfica que o professor pôs na
 * aula (sem o título "Referência bibliográfica"). Sem referência, só o aviso.
 */
export function pieceFoot(bibliography: string | null | undefined): string {
  const base = 'Esquema didático, simplificado para fins de ensino.';
  const ref = (bibliography ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^refer[eê]ncias?( bibliogr[aá]ficas?)?:?$/i.test(l))
    .join(' ');
  return ref ? `${base} Base: ${esc(ref)}` : base;
}

/** Lê uma peça no formato-fonte do piloto: blocos @@TITLE, @@STYLE, @@BODY, @@SCRIPT, @@FOOT. */
export function parsePieceSource(src: string): PieceBlocks {
  const block = (name: string) => {
    const m = new RegExp(`@@${name}\\n([\\s\\S]*?)(?=\\n@@[A-Z]+\\n|$)`).exec(src);
    return m ? m[1]! : '';
  };
  return {
    title: block('TITLE').trim(),
    style: block('STYLE'),
    body: block('BODY'),
    script: block('SCRIPT'),
    foot: block('FOOT').trim() || null,
  };
}

export type LintIssue = { level: 'error' | 'warning'; rule: string; message: string };

/** Tamanho máximo dos blocos somados (sem a base e as fontes). */
export const MAX_PIECE_BYTES = 150_000;

const FORBIDDEN: { rule: string; re: RegExp; message: string; in: 'all' | 'script' }[] = [
  {
    rule: 'external-resource',
    re: /\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\//i,
    message: 'Recurso de fora (link, imagem ou script externo). A peça precisa ser autocontida.',
    in: 'all',
  },
  {
    rule: 'external-css',
    re: /@import|url\(\s*["']?\s*(?:https?:)?\/\//i,
    message: 'CSS de fora (@import ou url externa).',
    in: 'all',
  },
  {
    rule: 'embedded-document',
    re: /<\s*(?:script\b[^>]*\bsrc|link\b|iframe\b|object\b|embed\b|base\b|meta\b|form\b)/i,
    message:
      'Elemento proibido na peça (script externo, link, iframe, object, embed, base, meta ou form).',
    in: 'all',
  },
  {
    rule: 'network',
    re: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(/,
    message: 'Acesso à rede no script. A peça não pode buscar nada de fora.',
    in: 'script',
  },
  {
    rule: 'storage',
    re: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/,
    message: 'Armazenamento do navegador: a peça roda isolada e isso quebra no app.',
    in: 'script',
  },
  {
    rule: 'unsafe-code',
    re: /\beval\s*\(|\bnew\s+Function\b|document\.write|\b(?:window\.)?(?:parent|top|opener)\s*\./,
    message: 'Código proibido (eval, Function, document.write ou acesso à página do app).',
    in: 'script',
  },
];

/**
 * Linter da peça (docs/producao/ESPECIFICACAO.md, "saída validada por um linter de peça antes
 * de salvar"): estrutura dos quatro blocos, nada de fora, nada de rede, script que compila.
 */
export function lintPiece(b: PieceBlocks): LintIssue[] {
  const issues: LintIssue[] = [];
  const error = (rule: string, message: string) => issues.push({ level: 'error', rule, message });
  const warn = (rule: string, message: string) => issues.push({ level: 'warning', rule, message });
  const markup = `${b.style}\n${b.body}\n${b.foot ?? ''}`;

  if (!b.title.trim()) error('title', 'A peça precisa de título.');
  if (!/class\s*=\s*["'][^"']*\beyebrow\b/.test(b.body))
    error('opening', 'Falta o eyebrow da abertura ("Peça interativa · tema").');
  if (!/<h1\b/i.test(b.body)) error('opening', 'Falta o título-afirmação (h1).');
  if (!/class\s*=\s*["'][^"']*\blead\b/.test(b.body)) error('opening', 'Falta o lead da abertura.');
  // "Para fixar" pode vir escrito ou ser a seção .explain preenchida pelo script (a linha do tempo
  // do piloto troca o texto conforme a época escolhida).
  if (!/Para fixar/i.test(b.body) && !/class\s*=\s*["'][^"']*\bexplain\b/.test(b.body))
    error('closing', 'Falta o bloco "Para fixar".');
  if (!/Na prova/i.test(b.body)) error('closing', 'Falta o bloco "Na prova".');
  if (!/<(?:canvas|svg|video)\b/i.test(b.body) && !/createElementNS|getContext\(/.test(b.script))
    error('stage', 'Falta a cena (canvas ou SVG) da área interativa.');
  if (/<h1\b[\s\S]*<h1\b/i.test(b.body)) warn('opening', 'Mais de um h1 na peça.');
  if (/<(?:canvas|svg)\b(?![^>]*(?:aria-label|aria-hidden|role=))/i.test(b.body))
    warn('a11y', 'Cena sem aria-label: o leitor de tela não descreve o que ela mostra.');

  for (const f of FORBIDDEN) {
    const text = f.in === 'script' ? b.script : `${markup}\n${b.script}`;
    if (f.re.test(text)) error(f.rule, f.message);
  }
  if (/<script\b/i.test(b.body))
    error('inline-script', 'Script dentro do corpo: vai no bloco de script.');

  const size = new TextEncoder().encode(markup + b.script).length;
  if (size > MAX_PIECE_BYTES) error('size', `A peça passa de ${MAX_PIECE_BYTES / 1000} kB.`);

  try {
    // Só compila (não executa) para achar erro de sintaxe antes do navegador.
    new Function(b.script);
  } catch (e) {
    error('syntax', `Erro de sintaxe no script: ${(e as Error).message}`);
  }
  return issues;
}

export const lintErrors = (issues: LintIssue[]) => issues.filter((i) => i.level === 'error');
