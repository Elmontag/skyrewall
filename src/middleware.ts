import { NextRequest, NextResponse } from 'next/server';

/**
 * In local development the AT Protocol OAuth server only accepts root-path
 * loopback redirect URIs (e.g. http://127.0.0.1:3000/) because RFC 8252 §8.3
 * forbids path components in loopback redirect URIs when using the special
 * http://localhost client_id.
 *
 * When the OAuth provider redirects back with ?code=…&state=… on the root
 * URL, this middleware transparently forwards those params to the real API
 * callback handler before the page component ever renders.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (
    pathname === '/' &&
    searchParams.has('state') &&
    (searchParams.has('code') || searchParams.has('error'))
  ) {
    const callbackUrl = req.nextUrl.clone();
    callbackUrl.pathname = '/api/auth/oauth/callback';
    return NextResponse.redirect(callbackUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
