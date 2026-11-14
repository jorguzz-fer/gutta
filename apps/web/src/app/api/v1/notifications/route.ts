import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { listNotifications } from '@/features/notifications/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(reminders.listNotifications, ({ userId }) =>
  listNotifications(userId),
);
