import { z } from 'zod';
import { apiRoute } from '@/lib/api';
import { deletePersonal } from '@/features/flashcards/service';

export const dynamic = 'force-dynamic';

// DELETE /api/v1/flashcards/:id: apaga cartão pessoal (só do próprio aluno).
export const DELETE = apiRoute<{ id: string }>(async ({ userId, params }) =>
  deletePersonal(userId, z.uuid().parse(params.id)),
);
