import { apiRoute } from '@/lib/api';
import { lessonHtml } from '@/features/production/review';

export const dynamic = 'force-dynamic';

// GET /api/v1/production/lessons/{id}: a aula interativa publicada, para o iframe do módulo.
// Qualquer pessoa logada que vê o módulo (publicado, pelo RLS) vê a peça. A política da peça
// (proxy.ts, buildPieceCsp) isola o HTML: sandbox sem mesma origem, sem rede.
export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const res = await apiRoute(async ({ userId, params }) => ({
    html: await lessonHtml(userId, params.id!),
  }))(req, ctx);
  if (!res.ok) return res;
  const { html } = (await res.json()) as { html: string };
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
