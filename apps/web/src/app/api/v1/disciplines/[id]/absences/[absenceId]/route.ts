import { attendance } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeAbsence } from '@/features/attendance/service';

export const dynamic = 'force-dynamic';

export const DELETE = contractRoute(attendance.removeAbsence, ({ userId, params }) =>
  removeAbsence(userId, params.id, params.absenceId),
);
