// Vetores para a busca por conceito (ADR 0014; SPEC v2, MAT-09). Provedor: Voyage AI
// (decisão do Fernando, 14/11/2026), modelo voyage-4, 1024 dimensões. Detalhes da API
// conferidos em docs.voyageai.com em 14/11/2026: POST /v1/embeddings, até 1.000 textos e
// 320 mil tokens por pedido no voyage-4, input_type "document" ou "query".

export const EMBEDDING_DIMENSIONS = 1024;

/** Preço por milhão de tokens (US$), tabela pública da Voyage (14/11/2026). */
const EMBEDDING_PRICES: Record<string, number> = {
  'voyage-4-large': 0.12,
  'voyage-4': 0.06,
  'voyage-4-lite': 0.02,
};

export function embeddingCostMicros(model: string, tokens: number) {
  return Math.round(tokens * (EMBEDDING_PRICES[model] ?? 0.06));
}

export type EmbedKind = 'document' | 'query';
export type EmbedResult = { vectors: number[][]; tokens: number; model: string };

export interface Embedder {
  readonly name: string;
  embed(texts: string[], kind: EmbedKind): Promise<EmbedResult>;
}

export class EmbedderUnavailable extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'EmbedderUnavailable';
  }
}

/** Teto por pedido: abaixo dos limites da Voyage para não depender da contagem exata. */
const BATCH = 128;

export class VoyageEmbedder implements Embedder {
  readonly name = 'voyage';
  constructor(
    private apiKey: string,
    private model = 'voyage-4',
    private url = 'https://api.voyageai.com/v1/embeddings',
  ) {}

  async embed(texts: string[], kind: EmbedKind): Promise<EmbedResult> {
    const vectors: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < texts.length; i += BATCH) {
      const input = texts.slice(i, i + BATCH);
      let res: Response;
      try {
        res = await fetch(this.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input,
            model: this.model,
            input_type: kind,
            truncation: true,
            output_dimension: EMBEDDING_DIMENSIONS,
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new EmbedderUnavailable('O serviço de vetores não respondeu.', true);
      }
      if (res.status === 401 || res.status === 403)
        throw new EmbedderUnavailable('Chave da Voyage AI inválida.');
      if (res.status === 429 || res.status >= 500)
        throw new EmbedderUnavailable(`Serviço de vetores indisponível (${res.status}).`, true);
      if (!res.ok) throw new EmbedderUnavailable(`Erro do serviço de vetores (${res.status}).`);
      const body = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
        usage?: { total_tokens?: number };
      };
      const ordered = [...body.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== input.length)
        throw new EmbedderUnavailable('Resposta do serviço de vetores incompleta.');
      for (const d of ordered) {
        if (d.embedding.length !== EMBEDDING_DIMENSIONS)
          throw new EmbedderUnavailable('Vetor com dimensão inesperada.');
        vectors.push(d.embedding);
      }
      tokens += body.usage?.total_tokens ?? 0;
    }
    return { vectors, tokens, model: this.model };
  }
}

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Sinônimos do provedor de teste: o bastante para os testes mostrarem a busca por conceito
// achando o que a busca por palavra não acha. Não é vocabulário médico de verdade.
const FAKE_SYNONYMS: [RegExp, string][] = [
  [/\bleucocit\w*|\bglobulos? brancos?\b/g, ' conceito_leucocito '],
  [/\binfart\w*|\biam\b/g, ' conceito_infarto '],
];

function features(text: string): string[] {
  let t = fold(text);
  for (const [re, tag] of FAKE_SYNONYMS) t = t.replace(re, tag);
  return (t.match(/[a-z_]{3,}/g) ?? []).map((w) => (w.startsWith('conceito_') ? w : w.slice(0, 5)));
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % EMBEDDING_DIMENSIONS;
}

/** Provedor de teste (CI e E2E): determinístico, sem rede e sem custo. */
export class FakeEmbedder implements Embedder {
  readonly name = 'fake';
  async embed(texts: string[], _kind?: EmbedKind): Promise<EmbedResult> {
    const vectors = texts.map((t) => {
      const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      const f = features(t);
      if (!f.length) v[0] = 1;
      for (const w of f) v[hash(w)]! += 1;
      const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
      return v.map((x) => x / norm);
    });
    return {
      vectors,
      tokens: texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
      model: 'fake-embed',
    };
  }
}

export type Chunk = { position: number; pageFrom: number; pageTo: number; text: string };

/**
 * Divide as páginas em trechos de cerca de `target` palavras, com `overlap` palavras repetidas
 * entre um e outro, guardando as páginas de origem. Trechos curtos (por volta de 350
 * palavras) mantêm a página precisa em slides, que têm pouco texto por página.
 */
export function chunkPages(
  pages: { page: number; text: string }[],
  opts: { target?: number; overlap?: number } = {},
): Chunk[] {
  const target = opts.target ?? 350;
  const overlap = Math.min(opts.overlap ?? 50, Math.floor(target / 2));
  const words: { w: string; page: number }[] = [];
  for (const p of pages)
    for (const w of p.text.split(/\s+/)) if (w) words.push({ w, page: p.page });
  const chunks: Chunk[] = [];
  for (let start = 0; start < words.length; start += target - overlap) {
    const slice = words.slice(start, start + target);
    chunks.push({
      position: chunks.length,
      pageFrom: slice[0]!.page,
      pageTo: slice.at(-1)!.page,
      text: slice.map((x) => x.w).join(' '),
    });
    if (start + target >= words.length) break;
  }
  return chunks;
}
