import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createJob } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.createJob, ({ userId, body }) => createJob(userId, body));
