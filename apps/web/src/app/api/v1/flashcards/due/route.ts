import { z } from 'zod';
import { apiRoute } from '@/lib/api';
import { dueQueue } from '@/features/flashcards/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/flashcards/due?moduleId=: revisões de hoje no fuso do aluno.
export const GET = apiRoute(async ({ userId, req }) => {
  const moduleId = new URL(req.url).searchParams.get('moduleId');
  return dueQueue(userId, { moduleId: moduleId ? z.uuid().parse(moduleId) : undefined });
});
