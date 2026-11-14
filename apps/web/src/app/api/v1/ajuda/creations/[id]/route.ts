import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { deleteCreation, getCreation, updateCreation } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getCreation, ({ userId, params }) =>
  getCreation(userId, params.id),
);

export const PATCH = contractRoute(c.updateCreation, ({ userId, params, body }) =>
  updateCreation(userId, params.id, body),
);

export const DELETE = contractRoute(c.deleteCreation, ({ userId, params }) =>
  deleteCreation(userId, params.id),
);
