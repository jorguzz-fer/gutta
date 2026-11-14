import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { restoreAnnotation } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.restoreAnnotation, ({ userId, params }) =>
  restoreAnnotation(userId, params.id),
);
