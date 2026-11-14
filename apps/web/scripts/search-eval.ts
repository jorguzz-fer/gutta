/*
  Mede a busca por conceito com material real (ADR 0014; plano, item 66). Para cada busca com a
  página certa conhecida, compara a busca por palavras (sobreposição de termos, sem acento) com
  a busca por vetores da Voyage AI: em quantas a página certa aparece entre as 5 primeiras.
  Uso: VOYAGE_API_KEY=... pnpm --filter @gutta/web search:eval caminho/para/bateria.json
  Formato do arquivo: scripts/fixtures/search-eval.example.json. Material de aluno real só com
  autorização; o arquivo da bateria não vai para o repositório.
*/
import { readFileSync } from 'node:fs';
import { chunkPages, embeddingCostMicros, VoyageEmbedder } from '@gutta/ai';

type Bateria = {
  documents: { id: string; pages: string[] }[];
  queries: { q: string; expected: { doc: string; page: number }[] }[];
};

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const terms = (t: string) => new Set(fold(t).match(/[a-z0-9]{3,}/g) ?? []);
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

async function main() {
  const file = process.argv[2];
  if (!file || !process.env.VOYAGE_API_KEY) {
    console.error('Uso: VOYAGE_API_KEY=... pnpm search:eval bateria.json');
    process.exit(2);
  }
  const b = JSON.parse(readFileSync(file, 'utf8')) as Bateria;
  const model = process.env.EMBEDDING_MODEL ?? 'voyage-4';
  const embedder = new VoyageEmbedder(process.env.VOYAGE_API_KEY, model);
  const chunks = b.documents.flatMap((d) =>
    chunkPages(d.pages.map((text, i) => ({ page: i + 1, text }))).map((c) => ({ ...c, doc: d.id })),
  );
  const docs = await embedder.embed(
    chunks.map((c) => c.text),
    'document',
  );
  const qs = await embedder.embed(
    b.queries.map((q) => q.q),
    'query',
  );
  let hitWord = 0;
  let hitVector = 0;
  for (const [i, q] of b.queries.entries()) {
    const ok = (c: (typeof chunks)[number]) =>
      q.expected.some((e) => e.doc === c.doc && e.page >= c.pageFrom && e.page <= c.pageTo);
    const qt = terms(q.q);
    const byWord = [...chunks]
      .map((c) => ({ c, s: [...terms(c.text)].filter((t) => qt.has(t)).length }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 5);
    const byVector = chunks
      .map((c, j) => ({ c, s: cos(qs.vectors[i]!, docs.vectors[j]!) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 5);
    const w = byWord.some((x) => ok(x.c));
    const v = byVector.some((x) => ok(x.c));
    hitWord += Number(w);
    hitVector += Number(v);
    console.log(
      `${w ? 'P' : '·'}${v ? 'V' : '·'}  ${q.q}  (melhor semelhança ${byVector[0]?.s.toFixed(2)})`,
    );
  }
  const n = b.queries.length;
  const cost = embeddingCostMicros(model, docs.tokens + qs.tokens) / 1e6;
  console.log(
    `\nPágina certa entre as 5 primeiras: palavra ${hitWord}/${n}, vetores ${hitVector}/${n}. Modelo ${model}, ${chunks.length} trechos, custo estimado US$ ${cost.toFixed(4)}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
