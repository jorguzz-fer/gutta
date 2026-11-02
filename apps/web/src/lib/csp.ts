// Content-Security-Policy montada por requisição (proxy.ts), para ler LESSON_ORIGINS em
// tempo de execução: o mesmo build serve ambientes com aulas em origens diferentes.
export function buildCsp(env: { lessonOrigins?: string; dev?: boolean }) {
  const lessons = (env.lessonOrigins ?? '')
    .split(/[\s,]+/)
    .filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o))
    .join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'" + (env.dev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    `frame-src 'self' ${lessons}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
