import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { listAnnotations } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.listAnnotations, ({ userId, params, query }) =>
  listAnnotations(userId, params.id, query.versionId),
);
