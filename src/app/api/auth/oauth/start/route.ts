import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/oauth-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';
import { getSessionUserId } from '@/lib/session';
import { query } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth:oauth-start');

interface UserRow { handle: string; did: string | null; }

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
    const handle: string | undefined = body.handle?.trim() || undefined;
    const privacyAccepted: boolean = body.privacyAccepted === true;
    // isReauth: set by the reconnect button to bind the OAuth flow to the current user's DID.
    // Prevents a different account from being accepted in the callback.
    const isReauth: boolean = body.isReauth === true;

    // When re-authenticating an existing session, look up the user's DID so we can
    // (a) pre-select their Bluesky account via PAR handle hint, and
    // (b) store the expected DID in a short-lived cookie for the callback to verify.
    let reauthDid: string | null = null;
    let reauthHandle: string | undefined = handle;
    if (isReauth) {
      const userId = await getSessionUserId();
      if (!userId) {
        return NextResponse.json({ error: 'Must be logged in to re-authorize.' }, { status: 401 });
      }
      const rows = await query<UserRow>('SELECT handle, did FROM users WHERE id = $1', [userId]);
      if (rows[0]) {
        reauthDid = rows[0].did;
        reauthHandle = reauthHandle ?? rows[0].handle;
      }
    }

    if (reauthHandle) {
      const handleRl = checkRateLimit(`oauth-start:handle:${reauthHandle.toLowerCase()}`, 5, 15 * 60 * 1000);
      if (!handleRl.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(handleRl.retryAfter) } }
        );
      }
    }

    const client = getOAuthClient();
    const url = await client.authorize(reauthHandle || 'bsky.social', {
      scope: 'atproto transition:generic',
    });

    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    const response = NextResponse.json({ redirectUrl: url.toString() });
    log.info('oauth-start', { handle: reauthHandle ?? '(none)', isReauth });

    if (privacyAccepted && !isReauth) {
      // Only set consent cookie for new registrations, not re-auth flows.
      // Re-auth never creates accounts — no consent needed.
      response.cookies.set('oauth_reg_consent', '1', { ...cookieOpts, maxAge: 10 * 60 });
    }
    if (isReauth && reauthDid) {
      // Bind expected DID so callback can reject a different account.
      response.cookies.set('oauth_reauth_did', reauthDid, { ...cookieOpts, maxAge: 10 * 60 });
    }
    return response;
  } catch (err) {
    log.error('start-error', { error: sanitizeError(err) });
    return NextResponse.json({ error: 'Failed to initiate OAuth flow.' }, { status: 500 });
  }
}
