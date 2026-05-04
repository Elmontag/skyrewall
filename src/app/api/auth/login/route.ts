import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { decrypt, signSession } from '@/lib/encryption';
import { BskyAgent } from '@atproto/api';
import { cookies, headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseSession } from '@/lib/session';

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
const AUTH_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }; // 10 req / 15 min

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string;
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
    const rows = await query<UserRow>('SELECT id, handle FROM users WHERE id = $1', [parsed.userId]);
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: { id: rows[0].id, handle: rows[0].handle } });
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  // Rate limiting by IP
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const rl = checkRateLimit(`login:${ip}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const { handle, password } = await req.json();
    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const rows = await query<UserRow>(
      'SELECT id, handle, encrypted_password FROM users WHERE handle = $1',
      [handle]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = rows[0];

    // Verify password against BlueSky (BlueSky auth is the source of truth)
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    // Also verify the stored (encrypted) password matches to ensure the user
    // registered with the same credentials we have on file
    const storedPassword = decrypt(user.encrypted_password);
    if (storedPassword !== password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

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
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}
