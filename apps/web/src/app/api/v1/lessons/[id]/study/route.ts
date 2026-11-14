import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getLessonStudy } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getLessonStudy, ({ userId, params }) =>
  getLessonStudy(userId, params.id),
);
