import { reminders } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createReminder, listReminders } from '@/features/reminders/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(reminders.listReminders, ({ userId, query }) =>
  listReminders(userId, query.status),
);

export const POST = contractRoute(reminders.createReminder, ({ userId, body }) =>
  createReminder(userId, body),
);
