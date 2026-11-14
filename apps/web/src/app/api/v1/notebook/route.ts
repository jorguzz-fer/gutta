import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createNote, listNotes } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.listNotes, ({ userId, query }) => listNotes(userId, query));

export const POST = contractRoute(c.createNote, ({ userId, body }) => createNote(userId, body));
