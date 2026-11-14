import { disciplines } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { attachDocument } from '@/features/academics/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(disciplines.attachDocument, ({ userId, params, body }) =>
  attachDocument(userId, params.id, body),
);
