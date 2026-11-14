import { schedule } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { confirmImport } from '@/features/schedule/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(schedule.confirmImport, ({ userId, params, body }) =>
  confirmImport(userId, params.id, body.items),
);
