import { schedule } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { rejectImport } from '@/features/schedule/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(schedule.rejectImport, ({ userId, params }) =>
  rejectImport(userId, params.id),
);
