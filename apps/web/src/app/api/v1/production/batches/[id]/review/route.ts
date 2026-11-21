import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { sendToReview } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/batches/{id}/review: as peças prontas vão para a revisão (Fase 4).
export const POST = contractRoute(production.sendToReview, async ({ userId, params }) => {
  await requireApiRole(userId, ['admin']);
  return sendToReview(userId, params.id);
});
