import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { trashMaterial, updateMaterial } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(materials.updateMaterial, ({ userId, params, body }) =>
  updateMaterial(userId, params.id, body),
);

export const DELETE = contractRoute(materials.trashMaterial, ({ userId, params }) =>
  trashMaterial(userId, params.id),
);
