import { apiRoute } from '@/lib/api';
import { exportCreation } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/ajuda/creations/{id}/export?formato=texto|anki (AJU-12): baixa a criação em
// Markdown, ou os flashcards em CSV para o Anki. Autenticação e erros como o resto da API.
export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const format = new URL(req.url).searchParams.get('formato') === 'anki' ? 'anki' : 'texto';
  const res = await apiRoute(async ({ userId, params }) =>
    exportCreation(userId, params.id!, format),
  )(req, ctx);
  if (!res.ok) return res;
  const file = (await res.json()) as { filename: string; type: string; body: string };
  return new Response(file.body, {
    headers: {
      'content-type': file.type,
      'content-disposition': `attachment; filename="${file.filename}"`,
      'cache-control': 'no-store',
    },
  });
};
