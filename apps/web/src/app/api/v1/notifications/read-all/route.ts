import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { readAllNotifications } from '@/features/notifications/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(reminders.readAllNotifications, ({ userId }) =>
  readAllNotifications(userId),
);
