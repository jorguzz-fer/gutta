import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeLesson, updateLesson } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(calendar.updateLesson, ({ userId, params, body }) =>
  updateLesson(userId, params.id, body),
);

export const DELETE = contractRoute(calendar.removeLesson, ({ userId, params }) =>
  removeLesson(userId, params.id),
);
