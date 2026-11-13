import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { addVersion } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(materials.addVersion, ({ userId, params, body }) =>
  addVersion(userId, params.id, body.fileId),
);
