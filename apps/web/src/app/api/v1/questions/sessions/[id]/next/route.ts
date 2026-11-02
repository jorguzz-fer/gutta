import { z } from 'zod';
import { apiRoute } from '@/lib/api';
import { nextQuestion } from '@/features/questions/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/questions/sessions/:id/next: próxima questão, sem gabarito.
export const GET = apiRoute<{ id: string }>(async ({ userId, params }) =>
  nextQuestion(userId, z.uuid().parse(params.id)),
);
