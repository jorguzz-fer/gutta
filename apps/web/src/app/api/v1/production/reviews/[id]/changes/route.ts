import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { requestChanges } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/reviews/{id}/changes: o revisor pede ajuste num trecho da peça.
export const POST = contractRoute(production.requestChanges, async ({ userId, params, body }) => {
  await requireApiRole(userId, ['reviewer', 'admin']);
  return requestChanges(userId, params.id, body);
});
