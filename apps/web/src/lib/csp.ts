// Content-Security-Policy montada por requisição (proxy.ts), para ler LESSON_ORIGINS em
// tempo de execução: o mesmo build serve ambientes com aulas em origens diferentes.
export function buildCsp(env: { lessonOrigins?: string; storageEndpoint?: string; dev?: boolean }) {
  const lessons = (env.lessonOrigins ?? '')
    .split(/[\s,]+/)
    .filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o))
    .join(' ');
  // Bucket de arquivos (ADR 0012): o navegador envia e lê direto dele, por URL assinada.
  const storage = storageOrigin(env.storageEndpoint, env.dev);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'" + (env.dev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${storage}`.trim(),
    `connect-src 'self' ${storage}`.trim(),
    // Narração e vídeo da produção de aulas, no admin, lidos do bucket por URL assinada.
    `media-src 'self' blob: ${storage}`.trim(),
    `frame-src 'self' ${lessons}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Política da prévia das peças (produção de aulas, ADR 0021): a peça gerada por IA roda isolada
 * (sandbox sem mesma origem: não lê cookie nem a página do app), sem rede, só com o que traz
 * dentro de si; pode ser emoldurada só pelo próprio app.
 */
export function buildPieceCsp(env: { storageEndpoint?: string; appUrl?: string; dev?: boolean }) {
  const storage = storageOrigin(env.storageEndpoint, env.dev);
  // O vídeo da peça vem por URL assinada: do bucket ou, no armazenamento em disco, do próprio app.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.appUrl ?? '');
  const app = storageOrigin(env.appUrl, env.dev || local);
  return [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'font-src data:',
    'img-src data: blob:',
    `media-src data: blob: ${storage} ${app}`.replace(/\s+/g, ' ').trim(),
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function storageOrigin(endpoint: string | undefined, dev?: boolean): string {
  if (!endpoint) return '';
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:' || (dev && u.protocol === 'http:')) return u.origin;
  } catch {
    // endereço inválido: não entra na política
  }
  return '';
}
