import { NextRequest, NextResponse } from 'next/server';
import { getSessionCredentials, getSessionUserId } from '@/lib/session';
import { fetchUserLists, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';
import { sanitizeError } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json();

    // Prefer session credentials; fall back to explicit body credentials for stateless use
    const sessionCreds = await getSessionCredentials();
    const isStateless = body.stateless === true;
    const handle: string | undefined = sessionCreds?.handle ?? (isStateless ? body.handle : undefined);
    const password: string | undefined = sessionCreds?.password ?? (isStateless ? body.password : undefined);
    const userId = await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:lists',
      identity: userId ?? handle,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const agent = await createAgent(handle, password);
    const lists = await fetchUserLists(agent);

    return NextResponse.json({ lists });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/bluesky/lists]', sanitizeError(err));
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }
}
