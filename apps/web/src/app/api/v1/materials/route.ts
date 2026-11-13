import { materials } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createMaterial, listMaterials } from '@/features/materials/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(materials.listMaterials, ({ userId, query }) =>
  listMaterials(userId, query),
);

export const POST = contractRoute(materials.createMaterial, ({ userId, body }) =>
  createMaterial(userId, body),
);
