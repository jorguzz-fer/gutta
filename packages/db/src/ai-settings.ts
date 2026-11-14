import { eq } from 'drizzle-orm';
import type { Tx } from './client';
import { appSettings } from './schema';

// Rede de proteção da camada de IA (SPEC v2, 7.7): o admin desliga cada recurso na hora e
// define o valor do alerta de gasto do mês. Lido pelo app e pelo worker (app_settings 'ai').

export const AI_FEATURES = ['cronograma', 'criacao', 'tutor_materiais', 'busca_conceito'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export type AiSettings = { alertMonthlyUsd: number | null; disabled: AiFeature[] };

export async function readAiSettings(tx: Tx): Promise<AiSettings> {
  const row = await tx.query.appSettings.findFirst({ where: eq(appSettings.key, 'ai') });
  const v = (row?.value ?? {}) as Partial<AiSettings>;
  return {
    alertMonthlyUsd:
      typeof v.alertMonthlyUsd === 'number' && v.alertMonthlyUsd > 0 ? v.alertMonthlyUsd : null,
    disabled: Array.isArray(v.disabled)
      ? v.disabled.filter((f): f is AiFeature => (AI_FEATURES as readonly string[]).includes(f))
      : [],
  };
}

export async function aiFeatureOn(tx: Tx, feature: AiFeature) {
  return !(await readAiSettings(tx)).disabled.includes(feature);
}

/**
 * A autorização de leitura dos materiais passou a citar a Voyage AI (vetores da busca por
 * conceito, decisão do Fernando de 14/11/2026). Só gera vetores quem autorizou a partir desta
 * versão da política; quem autorizou antes continua com a busca por palavra.
 */
export const AI_MATERIALS_VECTORS_SINCE = '2026-11-14';

export function coversVectors(c: { granted: boolean; version: string } | null | undefined) {
  return c?.granted === true && c.version >= AI_MATERIALS_VECTORS_SINCE;
}
