import { z } from 'zod';
import { apiRoute } from '@/lib/api';
import { sessionSummary } from '@/features/questions/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/questions/sessions/:id: resumo da sessão (só depois das tentativas).
export const GET = apiRoute<{ id: string }>(async ({ userId, params }) =>
  sessionSummary(userId, z.uuid().parse(params.id)),
);
