import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createLesson } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(calendar.createLesson, ({ userId, body }) =>
  createLesson(userId, body),
);
