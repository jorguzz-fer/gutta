import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';

// Teste de render das peças (docs/producao/ESPECIFICACAO.md, "Peças com texto sobreposto no
// primeiro render → teste automático com Playwright nos dois temas e captura de tela anexada").
// A peça abre isolada (sem rede), nos temas claro e escuro, e passa por quatro conferências:
// erro de script, rolagem lateral, cena vazia e texto sobreposto. O celular é só aviso.

export type Viewport = 'desktop' | 'mobile';
export type Theme = 'light' | 'dark';

export type Overlap = { a: string; b: string };

export type RenderCheck = {
  theme: Theme;
  viewport: Viewport;
  /** Conferência que reprova a peça (o celular só avisa). */
  blocking: boolean;
  errors: string[];
  overflow: boolean;
  emptyStage: boolean;
  overlaps: Overlap[];
  screenshot: Buffer;
};

export type RenderReport = {
  ok: boolean;
  /** Problemas que reprovam, em português, para o admin e para a IA corrigir. */
  problems: string[];
  /** Problemas só no celular: não reprovam, mas aparecem na tela da tarefa. */
  warnings: string[];
  checks: RenderCheck[];
};

export interface PieceRenderer {
  test(html: string): Promise<RenderReport>;
  close(): Promise<void>;
}

const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

const RUNS: { theme: Theme; viewport: Viewport; blocking: boolean }[] = [
  { theme: 'light', viewport: 'desktop', blocking: true },
  { theme: 'dark', viewport: 'desktop', blocking: true },
  { theme: 'light', viewport: 'mobile', blocking: false },
];

/**
 * Roda dentro da página: o que dá para medir sem olhar a imagem. Fica como texto (JavaScript
 * puro) porque o compilador do worker acrescenta auxiliares às funções que não existem na página.
 */
export const INSPECT_SOURCE = `(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const text = n.textContent && n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest('svg,script,style,noscript')) continue;
    if (!visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects())
      if (r.width > 2 && r.height > 2) boxes.push({ el, r, label: text.slice(0, 40) });
  }
  for (const t of document.querySelectorAll('svg text')) {
    const text = t.textContent && t.textContent.trim();
    if (!text || !visible(t) || t.closest('[aria-hidden="true"] text, defs')) continue;
    const r = t.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) boxes.push({ el: t, r, label: text.slice(0, 40) });
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length && overlaps.length < 10; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w <= 0 || h <= 0) continue;
      const area = w * h;
      const smaller = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
      // Encostar ou cruzar uma borda é comum; texto um em cima do outro, não.
      if (area > 24 && area > 0.3 * smaller) overlaps.push({ a: A.label, b: B.label });
    }
  }
  // Cena: um canvas desenhado ou um SVG com conteúdo, grande o bastante para ser a cena.
  let stage = false;
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    if (r.width * r.height < 20000 || !visible(c)) continue;
    try {
      const ctx = c.getContext('2d');
      if (!ctx || !c.width || !c.height) continue;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let k = 3; k < data.length; k += 4 * 97)
        if (data[k] > 0) { stage = true; break; }
    } catch (e) {
      stage = true;
    }
    if (stage) break;
  }
  // Peça de vídeo: o player é a cena (no teste ele não carrega o arquivo).
  if (!stage)
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height >= 20000 && visible(v)) { stage = true; break; }
    }
  if (!stage)
    for (const s of document.querySelectorAll('svg')) {
      const r = s.getBoundingClientRect();
      if (r.width * r.height >= 20000 && visible(s) && s.querySelectorAll('*').length > 3) {
        stage = true;
        break;
      }
    }
  const doc = document.documentElement;
  return { overlaps, emptyStage: !stage, overflow: doc.scrollWidth > doc.clientWidth + 1 };
})()`;

type Inspection = { overlaps: Overlap[]; emptyStage: boolean; overflow: boolean };

/** Chromium do sistema (imagem do worker, Alpine); sem ele, o do Playwright instalado. */
export function systemChromium(configured?: string) {
  if (configured) return configured;
  return ['/usr/bin/chromium-browser', '/usr/bin/chromium'].find((p) => existsSync(p));
}

const IGNORED_CONSOLE = /favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/i;

export class PlaywrightRenderer implements PieceRenderer {
  private browser: Promise<Browser> | null = null;

  constructor(private executablePath?: string) {}

  private launch() {
    this.browser ??= chromium.launch({
      executablePath: systemChromium(this.executablePath),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    return this.browser;
  }

  async test(html: string): Promise<RenderReport> {
    const browser = await this.launch();
    const checks: RenderCheck[] = [];
    for (const run of RUNS) {
      const ctx = await browser.newContext({
        viewport: VIEWPORTS[run.viewport],
        colorScheme: run.theme,
        deviceScaleFactor: 1,
        javaScriptEnabled: true,
      });
      const page: Page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) errors.push(m.text());
      });
      // Nada sai da peça: qualquer pedido de rede é bloqueado (e vira erro se a peça depender).
      await page.route(/^(?!data:|about:)/, (r) => r.abort('blockedbyclient'));
      try {
        let opened = true;
        try {
          await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
        } catch (e) {
          opened = false;
          errors.push(`A peça não abriu: ${(e as Error).message}`);
        }
        if (!opened) {
          checks.push({
            ...run,
            errors,
            overflow: false,
            emptyStage: true,
            overlaps: [],
            screenshot: Buffer.alloc(0),
          });
          continue;
        }
        await page.evaluate('document.fonts.ready');
        await page.waitForTimeout(800);
        // Falha aqui é do teste, não da peça: sobe e o trabalho tenta de novo.
        const r = (await page.evaluate(INSPECT_SOURCE)) as Inspection;
        const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
        checks.push({ ...run, errors, ...r, screenshot });
      } finally {
        await ctx.close();
      }
    }
    const describe = (c: RenderCheck) => {
      const where = `${c.theme === 'light' ? 'tema claro' : 'tema escuro'}${c.viewport === 'mobile' ? ', celular' : ''}`;
      const out: string[] = [];
      for (const e of c.errors) out.push(`Erro de script (${where}): ${e}`);
      if (c.overflow) out.push(`A página rola para o lado (${where}).`);
      if (c.emptyStage)
        out.push(`A cena abriu vazia (${where}): a peça precisa abrir num estado útil.`);
      for (const o of c.overlaps) out.push(`Texto sobreposto (${where}): "${o.a}" e "${o.b}".`);
      return out;
    };
    const problems = [...new Set(checks.filter((c) => c.blocking).flatMap(describe))];
    const warnings = [...new Set(checks.filter((c) => !c.blocking).flatMap(describe))];
    return { ok: problems.length === 0, problems, warnings, checks };
  }

  async close() {
    if (this.browser) await (await this.browser).close();
    this.browser = null;
  }
}
