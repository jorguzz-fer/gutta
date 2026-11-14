import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createTask, listTasks } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.listTasks, ({ userId, query }) => listTasks(userId, query));

export const POST = contractRoute(c.createTask, ({ userId, body }) => createTask(userId, body));
