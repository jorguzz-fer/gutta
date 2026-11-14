import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveProgress } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(c.saveProgress, ({ userId, params, body }) =>
  saveProgress(userId, params.id, body),
);
