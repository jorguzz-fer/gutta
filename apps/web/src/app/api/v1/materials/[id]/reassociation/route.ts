import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { applyReassociation, reassociationPlan } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.reassociation, ({ userId, params }) =>
  reassociationPlan(userId, params.id),
);

export const POST = contractRoute(c.applyReassociation, ({ userId, params, body }) =>
  applyReassociation(userId, params.id, body),
);
