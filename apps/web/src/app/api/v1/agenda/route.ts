import { agenda } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getAgenda } from '@/features/agenda/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(agenda.getAgenda, ({ userId, query }) => getAgenda(userId, query));
