import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { lessonContent } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(materials.lessonContent, ({ userId, params }) =>
  lessonContent(userId, params.id),
);
