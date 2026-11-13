import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getEvent, removeEvent, updateEvent } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(calendar.getEvent, ({ userId, params }) =>
  getEvent(userId, params.id),
);

export const PUT = contractRoute(calendar.updateEvent, ({ userId, params, body }) =>
  updateEvent(userId, params.id, body),
);

export const DELETE = contractRoute(calendar.removeEvent, ({ userId, params, query }) =>
  removeEvent(userId, params.id, query.scope, query.date),
);
