import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createEvent } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(calendar.createEvent, ({ userId, body }) =>
  createEvent(userId, body),
);
