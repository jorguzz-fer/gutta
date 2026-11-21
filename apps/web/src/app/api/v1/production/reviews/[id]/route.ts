import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { getReview } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// GET /api/v1/production/reviews/{id}: a peça em revisão com as questões e o histórico.
export const GET = contractRoute(production.getReview, async ({ userId, params }) => {
  await requireApiRole(userId, ['reviewer', 'admin']);
  return getReview(userId, params.id);
});
