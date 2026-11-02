import { apiRoute } from '@/lib/api';
import { exportData } from '@/features/privacy/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/me/export: download dos dados do próprio aluno (JSON).
export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const res = await apiRoute(async ({ userId }) => exportData(userId))(req, ctx);
  if (res.ok)
    res.headers.set(
      'content-disposition',
      `attachment; filename="gutta-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
    );
  return res;
};
