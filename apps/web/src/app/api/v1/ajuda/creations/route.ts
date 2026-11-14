import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { listCreations } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.listCreations, ({ userId, query }) =>
  listCreations(userId, query),
);
