import { apiRoute, readJson, requireApiRole } from '@/lib/api';
import {
  createQuestion,
  listQuestions,
  questionDraftInput,
  type Status,
} from '@/features/editorial/service';

export const dynamic = 'force-dynamic';
const ROLES = ['editor', 'reviewer', 'admin'];

async function currentUser(userId: string) {
  const roles = await requireApiRole(userId, ROLES);
  return { id: userId, name: '', email: '', twoFactorEnabled: true, roles };
}

// GET /api/v1/admin/questions?status=: fila editorial.
export const GET = apiRoute(async ({ userId, req }) => {
  const status = new URL(req.url).searchParams.get('status') as Status | null;
  return listQuestions(await currentUser(userId), { status: status ?? undefined });
});

// POST /api/v1/admin/questions: cria rascunho.
export const POST = apiRoute(async ({ userId, req }) =>
  createQuestion(await currentUser(userId), await readJson(req, questionDraftInput)),
);
