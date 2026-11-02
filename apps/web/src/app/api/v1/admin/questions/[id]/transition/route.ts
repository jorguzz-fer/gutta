import { z } from 'zod';
import { apiRoute, readJson, requireApiRole } from '@/lib/api';
import { transition, transitionInput } from '@/features/editorial/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/admin/questions/:id/transition: muda o status editorial (regras no serviço e no banco).
export const POST = apiRoute<{ id: string }>(async ({ userId, req, params }) => {
  const roles = await requireApiRole(userId, ['editor', 'reviewer', 'admin']);
  return transition(
    { id: userId, name: '', email: '', twoFactorEnabled: true, roles },
    z.uuid().parse(params.id),
    await readJson(req, transitionInput),
  );
});
