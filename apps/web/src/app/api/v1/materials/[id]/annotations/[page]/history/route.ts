import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { annotationHistory } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.annotationHistory, ({ userId, params, query }) =>
  annotationHistory(userId, params.id, params.page, query.versionId),
);
