import { attendance } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { recordAbsence } from '@/features/attendance/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(attendance.recordAbsence, ({ userId, params, body }) =>
  recordAbsence(userId, params.id, body),
);
