import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { deleteNote, updateNote } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(c.updateNote, ({ userId, params, body }) =>
  updateNote(userId, params.id, body),
);

export const DELETE = contractRoute(c.deleteNote, ({ userId, params }) =>
  deleteNote(userId, params.id),
);
