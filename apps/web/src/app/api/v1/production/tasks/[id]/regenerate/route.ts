import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { regenerateTask } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/production/tasks/{id}/regenerate: gera a peça de novo, com pedido de ajuste opcional.
export const POST = contractRoute(production.regenerateTask, async ({ userId, params, body }) => {
  await requireApiRole(userId, ['admin']);
  return regenerateTask(userId, params.id, body);
});
