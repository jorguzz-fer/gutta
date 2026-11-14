import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getTutorThread } from '@/features/tutor/materials';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getTutorThread, ({ userId, params }) =>
  getTutorThread(userId, params.id),
);
