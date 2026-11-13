import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getPreferences, savePreferences } from '@/features/notifications/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(reminders.getPreferences, ({ userId }) => getPreferences(userId));

export const PUT = contractRoute(reminders.savePreferences, ({ userId, body }) =>
  savePreferences(userId, body),
);
