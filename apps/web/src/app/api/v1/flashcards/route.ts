import { apiRoute, readJson } from '@/lib/api';
import { createFlashcard, createInput, listPersonal } from '@/features/flashcards/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/flashcards: cartões pessoais do aluno.
export const GET = apiRoute(async ({ userId }) => ({ items: await listPersonal(userId) }));

// POST /api/v1/flashcards: cria cartão pessoal (a partir de questão respondida ou livre).
export const POST = apiRoute(async ({ userId, req }) =>
  createFlashcard(userId, await readJson(req, createInput)),
);
