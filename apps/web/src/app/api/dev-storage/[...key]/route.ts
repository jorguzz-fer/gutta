import { FsStorage, contentDisposition } from '@gutta/storage';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Armazenamento em disco do desenvolvimento e do E2E (STORAGE_DRIVER=fs): faz o papel do
// bucket do R2. Só responde quando esse driver está ativo; em produção ele nem é criado.
function fsStorage() {
  const s = storage();
  return s instanceof FsStorage ? s : null;
}

type Ctx = { params: Promise<{ key: string[] }> };

export async function PUT(req: Request, ctx: Ctx) {
  const fs = fsStorage();
  if (!fs) return new Response(null, { status: 404 });
  const key = (await ctx.params).key.join('/');
  const ok = fs.verify(key, new URL(req.url).searchParams);
  if (ok?.op !== 'put') return new Response('assinatura inválida', { status: 403 });
  if (ok.contentType && req.headers.get('content-type') !== ok.contentType) {
    return new Response('tipo diferente do assinado', { status: 403 });
  }
  const body = Buffer.from(await req.arrayBuffer());
  if (ok.length && body.length !== Number(ok.length)) {
    return new Response('tamanho diferente do assinado', { status: 403 });
  }
  await fs.put(key, body);
  return new Response(null, { status: 200 });
}

export async function GET(req: Request, ctx: Ctx) {
  const fs = fsStorage();
  if (!fs) return new Response(null, { status: 404 });
  const key = (await ctx.params).key.join('/');
  const ok = fs.verify(key, new URL(req.url).searchParams);
  if (ok?.op !== 'get') return new Response('assinatura inválida', { status: 403 });
  const info = await fs.head(key);
  if (!info) return new Response(null, { status: 404 });
  const [kind, filename] = (ok.disposition ?? 'inline').split(';') as [
    'inline' | 'attachment',
    string?,
  ];
  return new Response(new Uint8Array(await fs.get(key)), {
    headers: {
      'content-type': ok.contentType || 'application/octet-stream',
      'content-disposition': contentDisposition(kind, filename),
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  });
}
