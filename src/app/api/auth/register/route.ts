import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt, signSession } from '@/lib/encryption';
import { checkRateLimit } from '@/lib/rate-limit';
import { SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from '@/lib/session-cookie';
import { rejectCrossOrigin, sanitizeError, getClientIp } from '@/lib/request-security';
import { createAgent } from '@/lib/bluesky';

// Per-IP limit: guards against distributed brute-force
const IP_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
// Per-handle limit: prevents brute-force even if IP limit is bypassed via header spoofing
const HANDLE_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

interface UserRow {
  id: string;
  handle: string;
}

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  // First line: rate-limit by IP
  const ip = getClientIp(req);
  const ipRl = checkRateLimit(`register:ip:${ip}`, IP_RATE_LIMIT.limit, IP_RATE_LIMIT.windowMs);
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter) } }
    );
  }

  try {
    const { handle, password, privacyAccepted } = await req.json();
    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }
    if (!privacyAccepted) {
      return NextResponse.json({ error: 'Privacy policy acceptance is required' }, { status: 400 });
    }

    // Second line: rate-limit by handle
    const handleRl = checkRateLimit(
      `register:handle:${String(handle).toLowerCase()}`,
      HANDLE_RATE_LIMIT.limit,
      HANDLE_RATE_LIMIT.windowMs
    );
    if (!handleRl.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(handleRl.retryAfter) } }
      );
    }

    // Verify credentials against the user's actual PDS
    const agent = await createAgent(handle, password);

    const encryptedPassword = encrypt(password);
    const sessionDid = agent.session?.did ?? null;

    const rows = await query<UserRow>(
      `INSERT INTO users (handle, encrypted_password, did)
       VALUES ($1, $2, $3)
       ON CONFLICT (handle) DO NOTHING
       RETURNING id, handle`,
      [handle, encryptedPassword, sessionDid]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'An account with this handle already exists. Please log in.' },
        { status: 409 }
      );
    }

    const user = rows[0];
    const sessionData = signSession(JSON.stringify({ userId: user.id, iat: Math.floor(Date.now() / 1000) }));
    const response = NextResponse.json({ success: true, user: { id: user.id, handle: user.handle } });
    response.cookies.set('session', sessionData, {
      ...sessionCookieOptions,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid BlueSky credentials' }, { status: 401 });
    }
    console.error('[register] error:', sanitizeError(err));
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
