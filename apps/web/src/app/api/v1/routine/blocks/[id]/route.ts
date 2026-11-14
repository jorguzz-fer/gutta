import { routine } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeBlock, updateBlock } from '@/features/routine/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(routine.updateBlock, ({ userId, params, body }) =>
  updateBlock(userId, params.id, body),
);

export const DELETE = contractRoute(routine.removeBlock, ({ userId, params, query }) =>
  removeBlock(userId, params.id, query.weekday),
);
