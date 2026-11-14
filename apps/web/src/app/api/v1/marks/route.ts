import { lessonStudy as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveMark } from '@/features/lesson-study/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.saveMark, ({ userId, body }) => saveMark(userId, body));
