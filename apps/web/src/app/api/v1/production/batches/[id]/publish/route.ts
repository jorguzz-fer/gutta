import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { publishBatch } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/batches/{id}/publish: publica as peças aprovadas da aula (Fase 4).
export const POST = contractRoute(production.publishBatch, async ({ userId, params }) => {
  await requireApiRole(userId, ['reviewer', 'admin']);
  return publishBatch(userId, params.id);
});
