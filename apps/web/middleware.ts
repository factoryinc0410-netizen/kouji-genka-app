import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'kgk.sid';
const PUBLIC_PATHS = ['/login'];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const sid = req.cookies.get(SESSION_COOKIE);

  if (!isPublic && !sid) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isPublic && sid && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/users';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
};
