import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { approveReview } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/reviews/{id}/approve: o revisor aprova a peça e as questões.
export const POST = contractRoute(production.approveReview, async ({ userId, params, body }) => {
  await requireApiRole(userId, ['reviewer', 'admin']);
  return approveReview(userId, params.id, body);
});
