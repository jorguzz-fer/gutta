import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { search } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(materials.search, ({ userId, query }) => search(userId, query));
