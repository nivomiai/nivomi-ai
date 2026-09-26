import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic check only (Next.js guidance): without the non-secret `nv_auth` hint cookie the
 * visitor is certainly signed out, so send them to sign-in before rendering the app. Real
 * authentication and authorization happen in the API on every request.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get('nv_auth')?.value === '1') return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
