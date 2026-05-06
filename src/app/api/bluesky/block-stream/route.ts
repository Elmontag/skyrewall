import { NextRequest } from 'next/server';
import { getSessionUserId, isValidDid } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { addToList, blockAccounts, createAgent } from '@/lib/bluesky';
import type { BskyAgent } from '@atproto/api';
import { logBlockEvents } from '@/lib/block-events';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  let body: { dids?: unknown; source?: string; handle?: string; password?: string; stateless?: boolean; add_to_list_uri?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { dids, source = 'manual' } = body;

  if (!Array.isArray(dids) || dids.length === 0 || dids.length > MAX_DIDS || !dids.every(isValidDid)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing dids' }), { status: 400 });
  }

  const sessionAgent = await getSessionAgent();
  const isStateless = body.stateless === true;
  const userId = sessionAgent?.userId ?? await getSessionUserId();

  const limited = checkApiRateLimit(req, {
    scope: 'bluesky:block-stream',
    identity: userId ?? body.handle,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  let agent: BskyAgent;
  let agentDid: string | undefined;
  if (sessionAgent) {
    agent = sessionAgent.agent;
    agentDid = agent.session?.did ?? (agent as unknown as { did?: string }).did;
  } else if (isStateless && body.handle && body.password) {
    agent = await createAgent(body.handle, body.password);
    agentDid = agent.session?.did;
  } else {
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
        const total = didList.length;
        const { succeeded, failed, succeededDids } = await blockAccounts(
          agent,
          didList,
          10,
          (done, tot, succ, fail) => {
            controller.enqueue(encode({ done, total: tot, succeeded: succ, failed: fail }));
          },
          agentDid
        );

        let warning: string | undefined;
        if (userId && succeededDids.length > 0) {
          try {
            await logBlockEvents(userId, succeededDids, 'block', resolvedSource);
          } catch {
            warning = 'Action completed, but local event logging failed.';
          }
        }

        let addedToList = 0;
        let listAddFailed = 0;
        const add_to_list_uri = typeof body.add_to_list_uri === 'string' && body.add_to_list_uri.startsWith('at://') ? body.add_to_list_uri : null;
        if (add_to_list_uri && succeededDids.length > 0) {
          try {
            const listResult = await addToList(agent, add_to_list_uri, succeededDids, agentDid);
            addedToList = listResult.succeeded;
            listAddFailed = listResult.failed;
          } catch { /* non-fatal */ }
        }

        controller.enqueue(encode({ done: total, total, succeeded, failed, warning, addedToList, listAddFailed, complete: true }));
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
