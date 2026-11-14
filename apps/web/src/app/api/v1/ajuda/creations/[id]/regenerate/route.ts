import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { regenerateCreation } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.regenerateCreation, ({ userId, params }) =>
  regenerateCreation(userId, params.id),
);
