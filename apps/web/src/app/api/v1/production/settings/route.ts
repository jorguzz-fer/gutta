import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { getMediaSettings, updateMediaSettings } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// GET e PUT /api/v1/production/settings: vozes por disciplina e cota diária de mídia (Fase 3).
export const GET = contractRoute(production.getMediaSettings, async ({ userId }) => {
  await requireApiRole(userId, ['admin']);
  return getMediaSettings(userId);
});

export const PUT = contractRoute(production.updateMediaSettings, async ({ userId, body }) => {
  await requireApiRole(userId, ['admin']);
  return updateMediaSettings(userId, body);
});
