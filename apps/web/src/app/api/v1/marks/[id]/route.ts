import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { deleteMark, updateMark } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(c.updateMark, ({ userId, params, body }) =>
  updateMark(userId, params.id, body),
);

export const DELETE = contractRoute(c.deleteMark, ({ userId, params }) =>
  deleteMark(userId, params.id),
);
