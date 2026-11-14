import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveAnnotation } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(c.saveAnnotation, ({ userId, params, body }) =>
  saveAnnotation(userId, params.id, params.page, body),
);
