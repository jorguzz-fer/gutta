import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { mediaAction } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/tasks/{id}/media: decisões do admin na mídia do vídeo (Fase 3).
export const POST = contractRoute(production.mediaAction, async ({ userId, params, body }) => {
  await requireApiRole(userId, ['admin']);
  return mediaAction(userId, params.id, body);
});
