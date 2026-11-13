import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { restoreMaterial } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(materials.restoreMaterial, ({ userId, params }) =>
  restoreMaterial(userId, params.id),
);
