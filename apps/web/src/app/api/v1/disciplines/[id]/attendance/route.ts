import { attendance } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getAttendance } from '@/features/attendance/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(attendance.getAttendance, ({ userId, params, query }) =>
  getAttendance(userId, params.id, query.month),
);
