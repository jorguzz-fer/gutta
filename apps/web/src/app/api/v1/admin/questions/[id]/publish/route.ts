import { z } from 'zod';
import { apiRoute, requireApiRole } from '@/lib/api';
import { transition } from '@/features/editorial/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/admin/questions/:id/publish: publicação, só por revisor (SPEC §11).
export const POST = apiRoute<{ id: string }>(async ({ userId, params }) => {
  const roles = await requireApiRole(userId, ['reviewer', 'admin']);
  return transition(
    { id: userId, name: '', email: '', twoFactorEnabled: true, roles },
    z.uuid().parse(params.id),
    { to: 'published' },
  );
});
