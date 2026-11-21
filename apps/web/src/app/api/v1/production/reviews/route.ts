import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { reviewQueue } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// GET /api/v1/production/reviews: fila do revisor (Fase 4).
export const GET = contractRoute(production.reviewQueue, async ({ userId }) => {
  await requireApiRole(userId, ['reviewer', 'admin']);
  return reviewQueue(userId);
});
