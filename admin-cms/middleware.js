import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = 'novasuite_cms';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  try {
    const secret = new TextEncoder().encode(process.env.ADMIN_CMS_SECRET || '');
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)'],
};
