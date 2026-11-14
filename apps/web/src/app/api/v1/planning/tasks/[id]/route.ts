import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { updateTask } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(c.updateTask, ({ userId, params, body }) =>
  updateTask(userId, params.id, body),
);
