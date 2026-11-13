import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';

const PROTECTED = ['/app', '/admin', '/professor', '/onboarding', '/seguranca'];

/*
  Roda em toda requisição de página e API:
  1. CSP com as origens de aula lidas em tempo de execução.
  2. Checagem otimista de sessão nas áreas logadas: sem cookie, nem renderiza.
     A autorização de verdade acontece no servidor (requireUser/requireRole) e no RLS.
*/
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsSession = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  let res: NextResponse;
  if (needsSession && !getSessionCookie(request, { cookiePrefix: 'gutta' })) {
    const url = new URL('/entrar', request.url);
    url.searchParams.set('next', pathname + search);
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next();
  }
  res.headers.set(
    'Content-Security-Policy',
    buildCsp({
      lessonOrigins: process.env.LESSON_ORIGINS,
      storageEndpoint: process.env.STORAGE_ENDPOINT,
      dev: process.env.NODE_ENV === 'development',
    }),
  );
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|woff2)$).*)'],
};
