import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/oauth-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`oauth-start:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Optional handle: used for PAR (Pushed Authorization Requests) to pre-select the user's PDS
    const handle: string | undefined = body.handle?.trim() || undefined;
    // privacyAccepted: required for new-account OAuth registrations; stored in a short-lived
    // cookie so the callback can enforce consent before creating an account.
    const privacyAccepted: boolean = body.privacyAccepted === true;
    if (handle) {
      const handleRl = checkRateLimit(`oauth-start:handle:${handle.toLowerCase()}`, 5, 15 * 60 * 1000);
      if (!handleRl.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(handleRl.retryAfter) } }
        );
      }
    }

    const client = getOAuthClient();
    const url = await client.authorize(handle || 'bsky.social', {
      scope: 'atproto transition:generic',
    });

    const response = NextResponse.json({ redirectUrl: url.toString() });
    // Carry privacy consent through the OAuth redirect so the callback can
    // enforce it before creating a brand-new account (re-login never creates accounts).
    if (privacyAccepted) {
      response.cookies.set('oauth_reg_consent', '1', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60, // 10 minutes — enough for the OAuth round-trip
        path: '/',
      });
    }
    return response;
  } catch (err) {
    console.error('[oauth/start] error:', sanitizeError(err));
    return NextResponse.json({ error: 'Failed to initiate OAuth flow.' }, { status: 500 });
  }
}
