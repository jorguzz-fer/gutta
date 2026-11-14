import { routine } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createBlock } from '@/features/routine/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(routine.createBlock, ({ userId, body }) =>
  createBlock(userId, body),
);
