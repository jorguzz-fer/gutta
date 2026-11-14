import { eq } from 'drizzle-orm';
import type { Tx } from './client';
import { appSettings } from './schema';

// Rede de proteção da camada de IA (SPEC v2, 7.7): o admin desliga cada recurso na hora e
// define o valor do alerta de gasto do mês. Lido pelo app e pelo worker (app_settings 'ai').

export const AI_FEATURES = ['cronograma', 'criacao', 'tutor_materiais'] as const;
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
