import { schedule } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { retryImport } from '@/features/schedule/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(schedule.retryImport, ({ userId, params, body }) =>
  retryImport(userId, params.id, body),
);
