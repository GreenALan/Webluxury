import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n/config';
import { verifySession, SESSION_COOKIE } from './lib/auth';

const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always'
});

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/login') || pathname === '/admin/login') {
      return applySecurityHeaders(NextResponse.next());
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith('/api/admin')) {
    if (pathname === '/api/admin/login') {
      return applySecurityHeaders(NextResponse.next());
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      return applySecurityHeaders(
        NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 })
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith('/api')) return applySecurityHeaders(NextResponse.next());

  return applySecurityHeaders(intlMiddleware(req));
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)']
};
