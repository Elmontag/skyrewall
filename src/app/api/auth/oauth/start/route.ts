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
      scope: 'atproto',
    });

    return NextResponse.json({ redirectUrl: url.toString() });
  } catch (err) {
    console.error('[oauth/start] error:', sanitizeError(err));
    return NextResponse.json({ error: 'Failed to initiate OAuth flow.' }, { status: 500 });
  }
}
