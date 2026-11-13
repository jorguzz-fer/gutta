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
    `frame-src 'self' ${lessons}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
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
