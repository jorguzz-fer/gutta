import { z } from 'zod';
import { apiRoute, readJson } from '@/lib/api';
import { currentConsents, setMarketing } from '@/features/privacy/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/communication-preferences: estado por finalidade.
export const GET = apiRoute(async ({ userId }) => {
  const c = await currentConsents(userId);
  return {
    essential: true,
    marketing: c.latest.marketing?.granted ?? false,
    policyVersion: c.policyVersion,
  };
});

// PATCH /api/v1/communication-preferences: muda só o que é opcional (marketing).
export const PATCH = apiRoute(async ({ userId, req }) => {
  const body = await readJson(req, z.object({ marketing: z.boolean() }));
  await setMarketing(userId, body.marketing);
  return { essential: true, marketing: body.marketing };
});
