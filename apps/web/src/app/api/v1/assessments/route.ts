import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createAssessment } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(calendar.createAssessment, ({ userId, body }) =>
  createAssessment(userId, body),
);
