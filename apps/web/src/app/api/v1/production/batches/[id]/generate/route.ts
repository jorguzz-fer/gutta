import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { generateBatch } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/batches/{id}/generate: libera a geração das peças aprovadas (ADR 0021).
export const POST = contractRoute(production.generateBatch, async ({ userId, params }) => {
  await requireApiRole(userId, ['admin']);
  return generateBatch(userId, params.id);
});
