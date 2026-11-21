import { production } from '@gutta/contracts';
import { requireApiRole } from '@/lib/api';
import { contractRoute } from '@/lib/contract';
import { getTask, updateTask } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// PATCH /api/v1/production/tasks/{id}: aprovar, descartar ou editar uma tarefa (ADR 0021).
export const PATCH = contractRoute(production.updateTask, async ({ userId, params, body }) => {
  await requireApiRole(userId, ['admin']);
  return updateTask(userId, params.id, body);
});

// GET /api/v1/production/tasks/{id}: tarefa com o plano e o histórico de versões da peça.
export const GET = contractRoute(production.getTask, async ({ userId, params }) => {
  await requireApiRole(userId, ['admin']);
  return getTask(userId, params.id);
});
