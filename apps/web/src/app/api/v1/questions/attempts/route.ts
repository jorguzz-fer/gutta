import { apiRoute, readJson } from '@/lib/api';
import { attemptInput, submitAttempt } from '@/features/questions/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/questions/attempts: corrige no servidor, persiste e devolve o feedback.
export const POST = apiRoute(async ({ userId, req }) =>
  submitAttempt(userId, await readJson(req, attemptInput)),
);
