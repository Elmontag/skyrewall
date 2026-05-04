import { NextRequest } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, getSessionUserId, isValidDid } from '@/lib/session';
import { muteAccounts } from '@/lib/bluesky';
import { logBlockEvents } from '@/lib/block-events';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  let body: { dids?: unknown; source?: string; handle?: string; password?: string; stateless?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { dids, source = 'manual' } = body;

  if (!Array.isArray(dids) || dids.length === 0 || dids.length > MAX_DIDS || !dids.every(isValidDid)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing dids' }), { status: 400 });
  }

  const sessionCreds = await getSessionCredentials();
  const isStateless = body.stateless === true;
  const handle = sessionCreds?.handle ?? (isStateless ? body.handle : undefined);
  const password = sessionCreds?.password ?? (isStateless ? body.password : undefined);
  const userId = await getSessionUserId();

  const limited = checkApiRateLimit(req, {
    scope: 'bluesky:mute-stream',
    identity: userId ?? handle,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  if (!handle || !password) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const validSources = ['manual', 'reblock', 'interaction'] as const;
  type Source = typeof validSources[number];
  const resolvedSource: Source = validSources.includes(source as Source) ? (source as Source) : 'manual';
  const didList = dids as string[];

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

      try {
        const agent = new BskyAgent({ service: 'https://bsky.social' });
        await agent.login({ identifier: handle as string, password: password as string });

        const total = didList.length;
        const { succeeded, failed, succeededDids } = await muteAccounts(
          agent,
          didList,
          10,
          (done, tot, succ, fail) => {
            controller.enqueue(encode({ done, total: tot, succeeded: succ, failed: fail }));
          }
        );

        let warning: string | undefined;
        if (userId && succeededDids.length > 0) {
          try {
            await logBlockEvents(userId, succeededDids, 'mute', resolvedSource);
          } catch {
            warning = 'Action completed, but local event logging failed.';
          }
        }

        controller.enqueue(encode({ done: total, total, succeeded, failed, warning, complete: true }));
      } catch (err) {
        controller.enqueue(encode({ error: err instanceof Error ? err.message : 'Unknown error' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
