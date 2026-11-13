// Preço por milhão de tokens (US$), da tabela pública da Anthropic (consultada em 13/11/2026).
// Serve para estimar custo no admin e nos experimentos; a fatura real é a do console.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Custo em milionésimos de dólar. Escrita de cache custa 1,25× a entrada (TTL de 5 min). */
export function costMicros(model: string, u: Usage) {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  const dollars =
    (u.input * p.input +
      u.output * p.output +
      u.cacheRead * p.cacheRead +
      u.cacheWrite * p.input * 1.25) /
    1_000_000;
  return Math.round(dollars * 1_000_000);
}
