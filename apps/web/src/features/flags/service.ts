import 'server-only';
import { eq, schema as s, withAnonymous, withUser } from '@gutta/db';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import type { CurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { audit } from '@/lib/events';
import { forget, memo } from '@/lib/memo';
import { FEATURE_KEYS, resolveFlags, type FeatureKey, type Flags } from './catalog';

const SETTINGS_KEY = 'features';
const CACHE_KEY = 'flags:';

/** Estado das chaves, igual para todos. Cache de 30 s por processo (ADR 0006). */
export function flags(): Promise<Flags> {
  return memo(CACHE_KEY, 30_000, async () => {
    const row = await withAnonymous(db(), (tx) =>
      tx.query.appSettings.findFirst({ where: eq(s.appSettings.key, SETTINGS_KEY) }),
    );
    return resolveFlags(row?.value, env().FEATURES_ON ?? '');
  });
}

export async function featureEnabled(key: FeatureKey): Promise<boolean> {
  return (await flags())[key];
}

/** Página de um módulo desligado responde 404, como se não existisse. */
export async function requireFeature(key: FeatureKey): Promise<void> {
  if (!(await featureEnabled(key))) notFound();
}

/** Rota de API de um módulo desligado: 404 com código próprio. */
export async function assertFeature(key: FeatureKey): Promise<void> {
  if (!(await featureEnabled(key))) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

export async function saveFlags(admin: CurrentUser, raw: Record<string, unknown>) {
  const value: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) value[key] = raw[key] === 'on' || raw[key] === true;
  await withUser(db(), admin.id, async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({ key: SETTINGS_KEY, value, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value, updatedBy: admin.id, updatedAt: new Date() },
      });
    await audit(
      tx,
      admin.id,
      'features.updated',
      { type: 'app_settings', id: SETTINGS_KEY },
      value,
    );
  });
  forget(CACHE_KEY);
}
