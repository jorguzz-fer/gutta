import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { setReminderDone } from '@/features/reminders/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(reminders.setReminderDone, ({ userId, params, body }) =>
  setReminderDone(userId, params.id, body.done),
);
