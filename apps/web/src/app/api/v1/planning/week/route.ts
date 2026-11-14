import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getWeek } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getWeek, ({ userId, query }) => getWeek(userId, query.semana));
