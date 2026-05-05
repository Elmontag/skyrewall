import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { decrypt, encrypt, signSession } from '@/lib/encryption';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseSession } from '@/lib/session';
import { SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from '@/lib/session-cookie';
import { rejectCrossOrigin, getClientIp, sanitizeError } from '@/lib/request-security';
import { createAgent } from '@/lib/bluesky';

// Per-IP limit: guards against distributed brute-force
const IP_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }; // 10 req / 15 min
// Per-handle limit: prevents brute-force against a specific account even if the IP limit
// is bypassed via X-Forwarded-For spoofing
const HANDLE_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }; // 5 req / 15 min

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string | null;
  did: string | null;
  oauth_error_since: string | null;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const parsed = parseSession(session.value);
  if (!parsed) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  try {
    const rows = await query<UserRow>(
      'SELECT id, handle, encrypted_password, did, oauth_error_since FROM users WHERE id = $1',
      [parsed.userId]
    );
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = rows[0];
    return NextResponse.json({
      user: {
        id: user.id,
        handle: user.handle,
        // isOAuth mirrors sync-worker priority: OAuth is used whenever `did` is set,
        // regardless of whether an app-password is also stored.
        isOAuth: !!user.did,
        oauthErrorSince: user.oauth_error_since ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  // First line: rate-limit by IP (note: X-Forwarded-For can be spoofed without a
  // trusted proxy; the per-handle limit below is the defence against brute-force)
  const ip = getClientIp(req);
  const ipRl = checkRateLimit(`login:ip:${ip}`, IP_RATE_LIMIT.limit, IP_RATE_LIMIT.windowMs);
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter) } }
    );
  }

  try {
    const { handle, password } = await req.json();
    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Second line: rate-limit by handle — prevents brute-force of a specific account
    // even if the IP check is bypassed via header spoofing
    const handleRl = checkRateLimit(
      `login:handle:${String(handle).toLowerCase()}`,
      HANDLE_RATE_LIMIT.limit,
      HANDLE_RATE_LIMIT.windowMs
    );
    if (!handleRl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(handleRl.retryAfter) } }
      );
    }

    const rows = await query<UserRow>(
      'SELECT id, handle, encrypted_password, did FROM users WHERE handle = $1',
      [handle]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = rows[0];

    // Verify password against the user's actual PDS (source of truth)
    const agent = await createAgent(handle, password);
    const sessionDid = agent.session?.did;
    if (user.did && sessionDid && user.did !== sessionDid) {
      return NextResponse.json({ error: 'This handle is linked to a different account identity.' }, { status: 409 });
    }

    if (!user.encrypted_password) {
      await query(
        'UPDATE users SET encrypted_password = $1 WHERE id = $2',
        [encrypt(password), user.id]
      );
    } else {
      // If the stored password differs (e.g. user rotated their BlueSky app-password),
      // update it silently — BlueSky login above is the source of truth.
      const storedPassword = decrypt(user.encrypted_password);
      if (storedPassword !== password) {
        await query(
          'UPDATE users SET encrypted_password = $1 WHERE id = $2',
          [encrypt(password), user.id]
        );
      }
    }

    if (sessionDid) {
      await query(
        'UPDATE users SET did = $1 WHERE id = $2 AND (did IS NULL OR did = $1)',
        [sessionDid, user.id]
      ).catch(() => {}); // ignore unique-constraint conflicts
    }

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
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    console.error('[login] error:', sanitizeError(err));
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const response = NextResponse.json({ success: true });
  response.cookies.set('session', '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
