import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Checagem otimista: sem cookie de sessão, nem renderiza a área logada.
// A autorização de verdade acontece no servidor (requireUser/requireRole) e no RLS.
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: 'gutta' });
  if (!cookie) {
    const url = new URL('/entrar', request.url);
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/app/:path*',
    '/admin/:path*',
    '/onboarding/:path*',
    '/onboarding',
    '/seguranca/:path*',
  ],
};
