import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createTutorThread, listTutorThreads } from '@/features/tutor/materials';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.listTutorThreads, ({ userId }) => listTutorThreads(userId));
export const POST = contractRoute(c.createTutorThread, ({ userId, body }) =>
  createTutorThread(userId, body),
);
