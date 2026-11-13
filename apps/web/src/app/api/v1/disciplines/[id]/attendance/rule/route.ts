import { attendance } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveRule } from '@/features/attendance/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(attendance.saveRule, ({ userId, params, body }) =>
  saveRule(userId, params.id, body),
);
