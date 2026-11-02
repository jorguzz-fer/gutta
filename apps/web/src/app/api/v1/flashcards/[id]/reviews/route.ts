import { z } from 'zod';
import { apiRoute, readJson } from '@/lib/api';
import { reviewCard, reviewInput } from '@/features/flashcards/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/flashcards/:id/reviews: registra a nota e recalcula o vencimento.
export const POST = apiRoute<{ id: string }>(async ({ userId, req, params }) =>
  reviewCard(userId, z.uuid().parse(params.id), await readJson(req, reviewInput)),
);
