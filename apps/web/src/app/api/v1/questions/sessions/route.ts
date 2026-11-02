import { apiRoute, readJson } from '@/lib/api';
import { createSession, createSessionInput, recentSessions } from '@/features/questions/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/questions/sessions: cria sessão de treino, diagnóstico ou questão do dia.
export const POST = apiRoute(async ({ userId, req }) =>
  createSession(userId, await readJson(req, createSessionInput)),
);

// GET /api/v1/questions/sessions: últimas sessões do aluno.
export const GET = apiRoute(async ({ userId }) => ({ items: await recentSessions(userId) }));
