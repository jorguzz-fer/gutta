import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { askTutorThread } from '@/features/tutor/materials';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.askTutorThread, ({ userId, params, body }) =>
  askTutorThread(userId, params.id, body.message),
);
