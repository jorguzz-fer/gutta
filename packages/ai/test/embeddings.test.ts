import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_DIMENSIONS,
  EmbedderUnavailable,
  FakeEmbedder,
  VoyageEmbedder,
  chunkPages,
  embeddingCostMicros,
} from '../src/embeddings';

// Vetores da busca por conceito (ADR 0014; item 66).
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('trechos', () => {
  it('juntam páginas curtas, guardam as páginas de origem e se sobrepõem', () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      page: i + 1,
      text: Array.from({ length: 50 }, (_, j) => `p${i + 1}w${j}`).join(' '),
    }));
    const chunks = chunkPages(pages, { target: 120, overlap: 20 });
    expect(chunks[0]).toMatchObject({ position: 0, pageFrom: 1, pageTo: 3 });
    // 120 palavras com 20 repetidas: o segundo começa na palavra 100, a primeira da página 3.
    expect(chunks[1]!.text.startsWith('p3w0 ')).toBe(true);
    expect(chunks.at(-1)!.pageTo).toBe(10);
    expect(chunkPages([{ page: 1, text: '  ' }])).toEqual([]);
  });
});

describe('provedor de teste', () => {
  it('aproxima sinônimos que a busca por palavra não junta', async () => {
    const e = new FakeEmbedder();
    const { vectors } = await e.embed(
      [
        'Os leucócitos migram para o tecido inflamado.',
        'Glóbulos brancos no tecido',
        'Sistema de condução cardíaca',
      ],
      'document',
    );
    expect(vectors[0]!).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(cos(vectors[0]!, vectors[1]!)).toBeGreaterThan(cos(vectors[0]!, vectors[2]!));
  });
});

describe('Voyage AI', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('manda o pedido documentado e devolve os vetores na ordem', async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body, auth: (init.headers as Record<string, string>).Authorization! });
      const data = (body.input as string[])
        .map((_, i) => ({ embedding: new Array(EMBEDDING_DIMENSIONS).fill(i), index: i }))
        .reverse();
      return new Response(JSON.stringify({ data, usage: { total_tokens: 7 } }), { status: 200 });
    });
    const r = await new VoyageEmbedder('chave-de-teste').embed(['a', 'b'], 'query');
    expect(calls[0]).toMatchObject({
      url: 'https://api.voyageai.com/v1/embeddings',
      auth: 'Bearer chave-de-teste',
      body: { input: ['a', 'b'], model: 'voyage-4', input_type: 'query', output_dimension: 1024 },
    });
    expect(r.vectors.map((v) => v[0])).toEqual([0, 1]);
    expect(r.tokens).toBe(7);
  });

  it('limite de taxa vira erro que pode tentar de novo; chave errada não', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }));
    const rate = await new VoyageEmbedder('x').embed(['a'], 'document').catch((e) => e);
    expect(rate).toBeInstanceOf(EmbedderUnavailable);
    expect(rate.retryable).toBe(true);
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    const auth = await new VoyageEmbedder('x').embed(['a'], 'document').catch((e) => e);
    expect(auth.retryable).toBe(false);
  });

  it('custo pela tabela da Voyage', () => {
    expect(embeddingCostMicros('voyage-4', 1_000_000)).toBe(60_000);
  });
});
