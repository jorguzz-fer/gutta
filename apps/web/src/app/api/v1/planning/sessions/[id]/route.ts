import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { deleteSession, updateSession } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(c.updateSession, ({ userId, params, body }) =>
  updateSession(userId, params.id, body),
);

export const DELETE = contractRoute(c.deleteSession, ({ userId, params }) =>
  deleteSession(userId, params.id),
);
