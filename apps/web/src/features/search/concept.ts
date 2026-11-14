import 'server-only';
import {
  EmbedderUnavailable,
  embeddingCostMicros,
  FakeEmbedder,
  VoyageEmbedder,
  type Embedder,
} from '@gutta/ai';
import { aiFeatureOn, coversVectors, schema as s, sql, type Tx } from '@gutta/db';
import { env } from '@/lib/env';
import { latestConsent } from '@/features/privacy/consent';

/*
  Busca por conceito (ADR 0014; SPEC v2, MAT-09). A pergunta vira vetor na Voyage AI e é
  comparada com os trechos do próprio aluno, dentro do withUser (RLS). Erro do serviço nunca
  derruba a busca: fica só a busca por palavra.
*/

let embedder: Embedder | null | undefined;
export function conceptEmbedder(): Embedder | null {
  if (embedder === undefined)
    embedder =
      env().AI_PROVIDER === 'fake'
        ? new FakeEmbedder()
        : env().VOYAGE_API_KEY
          ? new VoyageEmbedder(env().VOYAGE_API_KEY!, env().EMBEDDING_MODEL)
          : null;
  return embedder;
}

export type ConceptStatus = 'on' | 'needs_consent' | 'off';

/** Ligada se há chave, o admin não pausou e o aluno autorizou com o texto que cita a Voyage. */
export async function conceptStatus(tx: Tx, userId: string): Promise<ConceptStatus> {
  if (!conceptEmbedder() || !(await aiFeatureOn(tx, 'busca_conceito'))) return 'off';
  return coversVectors(await latestConsent(tx, userId, 'ai_materials')) ? 'on' : 'needs_consent';
}

/** Semelhança mínima (cosseno) para um trecho contar como achado por assunto. */
export const MIN_SIMILARITY = 0.3;

export type ConceptHit = {
  materialId: string;
  versionId: string;
  pageFrom: number;
  pageTo: number;
  text: string;
  similarity: number;
};

/** Vetor da pergunta, com o uso registrado. Null quando o serviço falha. */
export async function embedQuery(tx: Tx, userId: string, q: string): Promise<number[] | null> {
  const e = conceptEmbedder();
  if (!e) return null;
  try {
    const r = await e.embed([q], 'query');
    await tx.insert(s.aiUsage).values({
      ownerId: userId,
      feature: 'embedding_query',
      model: r.model,
      inputTokens: r.tokens,
      costMicros: embeddingCostMicros(r.model, r.tokens),
    });
    return r.vectors[0] ?? null;
  } catch (err) {
    if (err instanceof EmbedderUnavailable) return null;
    throw err;
  }
}

/** Trechos mais próximos da pergunta, só da versão atual de materiais fora da lixeira. */
export async function nearestChunks(
  tx: Tx,
  userId: string,
  vector: number[],
  opts: { limit?: number; materialIds?: string[]; extra?: ReturnType<typeof sql> } = {},
): Promise<ConceptHit[]> {
  const v = `[${vector.join(',')}]`;
  const only = opts.materialIds?.length
    ? sql`and c.material_id in (${sql.join(
        opts.materialIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const rows = await tx.execute<{
    material_id: string;
    version_id: string;
    page_from: number;
    page_to: number;
    text: string;
    similarity: number;
  }>(sql`
    select c.material_id, c.version_id, c.page_from, c.page_to, c.text,
           1 - (c.embedding <=> ${v}::vector) as similarity
    from material_chunks c
    join materials m on m.id = c.material_id
    where c.owner_id = ${userId} and m.deleted_at is null
      and c.version_id = (
        select v.id from material_versions v where v.material_id = c.material_id
        order by v.version desc limit 1)
      ${only} ${opts.extra ?? sql``}
    order by c.embedding <=> ${v}::vector
    limit ${opts.limit ?? 20}`);
  return rows.rows
    .map((r) => ({
      materialId: r.material_id,
      versionId: r.version_id,
      pageFrom: r.page_from,
      pageTo: r.page_to,
      text: r.text,
      similarity: Number(r.similarity),
    }))
    .filter((r) => r.similarity >= MIN_SIMILARITY);
}

/** Fusão por posição (RRF): junta as duas listas sem precisar comparar as notas. */
export function fuseRanks<T>(lists: T[][], key: (x: T) => string, k = 60): T[] {
  const score = new Map<string, { item: T; s: number }>();
  for (const list of lists)
    list.forEach((item, i) => {
      const id = key(item);
      const cur = score.get(id) ?? { item, s: 0 };
      cur.s += 1 / (k + i + 1);
      score.set(id, cur);
    });
  return [...score.values()].sort((a, b) => b.s - a.s).map((x) => x.item);
}
