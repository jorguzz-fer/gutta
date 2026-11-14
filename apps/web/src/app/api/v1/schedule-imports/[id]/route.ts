import { schedule } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getImport } from '@/features/schedule/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(schedule.getImport, ({ userId, params }) =>
  getImport(userId, params.id),
);
