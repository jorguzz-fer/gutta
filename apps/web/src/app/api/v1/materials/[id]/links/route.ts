import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { linkMaterial } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(materials.linkMaterial, ({ userId, params, body }) =>
  linkMaterial(userId, params.id, body),
);
