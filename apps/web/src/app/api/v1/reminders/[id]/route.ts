import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeReminder, updateReminder } from '@/features/reminders/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(reminders.updateReminder, ({ userId, params, body }) =>
  updateReminder(userId, params.id, body),
);

export const DELETE = contractRoute(reminders.removeReminder, ({ userId, params }) =>
  removeReminder(userId, params.id),
);
