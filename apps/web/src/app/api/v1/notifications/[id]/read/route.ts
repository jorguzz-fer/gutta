import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { readNotification } from '@/features/notifications/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(reminders.readNotification, ({ userId, params }) =>
  readNotification(userId, params.id),
);
