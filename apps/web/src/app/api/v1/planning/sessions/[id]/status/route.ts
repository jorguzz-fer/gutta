import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { markSession } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.markSession, ({ userId, params, body }) =>
  markSession(userId, params.id, body),
);
