import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { cancelJob } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.cancelJob, ({ userId, params }) =>
  cancelJob(userId, params.id),
);
