import { NextResponse } from 'next/server';

/**
 * Serves the AT Protocol OAuth client metadata document.
 * The URL of this endpoint is the OAuth client_id.
 * Must be publicly accessible over HTTPS in production.
 */
export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  if (!appUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 });
  }

  const isLocalhost =
    appUrl.startsWith('http://localhost') || appUrl.startsWith('http://127.');

  const clientId = isLocalhost ? 'http://localhost' : `${appUrl}/client-metadata.json`;

  // RFC 8252 §8.3: loopback redirects must use 127.0.0.1, not "localhost"
  const redirectBase = isLocalhost
    ? appUrl.replace(/^http:\/\/localhost/, 'http://127.0.0.1')
    : appUrl;

  const metadata = {
    client_id: clientId,
    client_name: 'SkyreWall',
    client_uri: appUrl,
    redirect_uris: [`${redirectBase}/api/auth/oauth/callback`],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
