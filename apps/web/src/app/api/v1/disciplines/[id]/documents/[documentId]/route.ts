import { disciplines } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { detachDocument } from '@/features/academics/service';

export const dynamic = 'force-dynamic';

export const DELETE = contractRoute(disciplines.detachDocument, ({ userId, params }) =>
  detachDocument(userId, params.id, params.documentId),
);
