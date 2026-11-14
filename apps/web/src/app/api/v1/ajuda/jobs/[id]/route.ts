import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getJob } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getJob, ({ userId, params }) => getJob(userId, params.id));
