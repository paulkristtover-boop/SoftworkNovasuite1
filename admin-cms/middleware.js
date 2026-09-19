import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = 'novasuite_cms';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    const secret = process.env.ADMIN_CMS_SECRET;
    if (!secret) return NextResponse.redirect(new URL('/login', req.url));
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
