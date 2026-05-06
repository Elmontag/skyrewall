import { NextRequest, NextResponse } from 'next/server';
import { isValidDid } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { checkFollowings } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const sessionAgent = await getSessionAgent();
    if (!sessionAgent) {
      return NextResponse.json({ error: 'Login required for following protection' }, { status: 401 });
    }

    const userId = sessionAgent.userId;
    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:check-followings',
      identity: userId,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    const body = await req.json();
    const { dids } = body;

    if (!Array.isArray(dids)) {
      return NextResponse.json({ error: 'dids must be an array' }, { status: 400 });
    }
    if (dids.length > MAX_DIDS) {
      return NextResponse.json({ error: `Too many DIDs (max ${MAX_DIDS})` }, { status: 400 });
    }
    if (!dids.every(isValidDid)) {
      return NextResponse.json({ error: 'One or more DIDs are invalid' }, { status: 400 });
    }

    const followingDids = await checkFollowings(sessionAgent.agent, dids);

    return NextResponse.json({ followingDids });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    console.error('[check-followings]', sanitizeError(err));
    return NextResponse.json({ error: 'Failed to check followings' }, { status: 500 });
  }
}
