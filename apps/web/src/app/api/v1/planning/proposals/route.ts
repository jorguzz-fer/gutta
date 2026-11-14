import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createProposal } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.createProposal, ({ userId, body }) =>
  createProposal(userId, body),
);
