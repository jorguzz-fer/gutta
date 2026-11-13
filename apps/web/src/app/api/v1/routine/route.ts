import { routine } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getRoutine } from '@/features/routine/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(routine.getRoutine, ({ userId, query }) =>
  getRoutine(userId, query.week),
);
