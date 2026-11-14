import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createRequest } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.createRequest, ({ userId, body }) =>
  createRequest(userId, body),
);
