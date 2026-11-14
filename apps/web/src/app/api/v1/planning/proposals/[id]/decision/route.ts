import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { decideProposal } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.decideProposal, ({ userId, params, body }) =>
  decideProposal(userId, params.id, body),
);
