import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt, signSession } from '@/lib/encryption';
import { BskyAgent } from '@atproto/api';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
const AUTH_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }; // 10 req / 15 min

interface UserRow {
  id: string;
  handle: string;
}

export async function POST(req: NextRequest) {
  // Rate limiting by IP
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const rl = checkRateLimit(`register:${ip}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const { handle, password } = await req.json();
    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Verify BlueSky credentials first
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    const encryptedPassword = encrypt(password);

    const rows = await query<UserRow>(
      `INSERT INTO users (handle, encrypted_password)
       VALUES ($1, $2)
       ON CONFLICT (handle) DO NOTHING
       RETURNING id, handle`,
      [handle, encryptedPassword]
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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid BlueSky credentials' }, { status: 401 });
    }
    console.error('[register] error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
