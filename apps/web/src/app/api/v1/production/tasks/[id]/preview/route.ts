import { apiRoute, requireApiRole } from '@/lib/api';
import { previewPiece } from '@/features/production/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/production/tasks/{id}/preview?versao=&tema=claro|escuro: a peça montada, para o
// iframe da tela da tarefa. A política de segurança (proxy.ts, buildPieceCsp) isola a peça:
// sandbox sem mesma origem e sem rede.
export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const q = new URL(req.url).searchParams;
  const version = Number(q.get('versao')) || null;
  const tema = q.get('tema');
  const theme = tema === 'escuro' ? 'dark' : tema === 'claro' ? 'light' : null;
  const res = await apiRoute(async ({ userId, params }) => {
    // O revisor também vê a prévia (Fase 4); a RLS da produção libera a leitura para ele.
    await requireApiRole(userId, ['admin', 'reviewer']);
    return { html: await previewPiece(userId, params.id!, { version, theme }) };
  })(req, ctx);
  if (!res.ok) return res;
  const { html } = (await res.json()) as { html: string };
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
