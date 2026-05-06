import { BskyAgent } from '@atproto/api';
import type { Agent } from '@atproto/api';
import type { Follower } from '@/types';
import { query } from '@/lib/db';
import { logBlockEvents } from '@/lib/block-events';
import { isValidDid } from '@/lib/session';
import { createOAuthAgent } from '@/lib/oauth-client';
import { assertPublicPdsHostname, didWebToDocumentUrl, validatePdsServiceEndpoint } from '@/lib/pds';

const CLEARSKY_BASE = 'https://public.api.clearsky.services';

/**
 * Retries an async operation on HTTP 429/503 with exponential backoff.
 * Respects Retry-After header (capped at 60s). Up to maxAttempts total tries.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if (status !== 429 && status !== 503) throw err;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const retryAfterRaw =
        (err as any)?.response?.headers?.get?.('retry-after') ??
        (err as any)?.response?.headers?.get?.('Retry-After') ??
        (err as any)?.headers?.get?.('retry-after') ??
        (err as any)?.headers?.get?.('Retry-After') ??
        (err as any)?.headers?.['retry-after'];
      /* eslint-enable @typescript-eslint/no-explicit-any */
      let waitMs: number;
      if (retryAfterRaw) {
        const secs = parseInt(retryAfterRaw as string, 10);
        waitMs = Math.min(isNaN(secs) ? 1000 : secs * 1000, 60_000);
      } else {
        waitMs = Math.min(1000 * Math.pow(2, attempt), 60_000);
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Resolves a handle or DID to the user's actual PDS service URL.
 * Uses the Bluesky relay for handle→DID resolution, then the PLC directory
 * or did:web well-known for DID→PDS resolution.
 * Fails closed when identity or PDS endpoint discovery cannot be verified so
 * app-password credentials are never sent to an unintended fallback PDS.
 */
export async function resolvePdsUrl(handleOrDid: string): Promise<string> {
  let did: string;

  if (handleOrDid.startsWith('did:')) {
    did = handleOrDid;
  } else {
    const res = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`,
      { redirect: 'error', signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error('Could not resolve Bluesky handle to a DID');
    ({ did } = (await res.json()) as { did: string });
  }

  if (!isValidDid(did)) {
    throw new Error('Resolved DID is invalid');
  }

  let didDocUrl: string;
  if (did.startsWith('did:plc:')) {
    didDocUrl = `https://plc.directory/${encodeURIComponent(did)}`;
  } else if (did.startsWith('did:web:')) {
    didDocUrl = didWebToDocumentUrl(did);
  } else {
    throw new Error('Unsupported DID method for PDS discovery');
  }

  const docRes = await fetch(didDocUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!docRes.ok) throw new Error('Could not fetch DID document for PDS discovery');
  const doc = (await docRes.json()) as { service?: { id: string; serviceEndpoint: string }[] };

  const pds = doc.service?.find((s) => s.id === '#atproto_pds');
  if (!pds?.serviceEndpoint) throw new Error('DID document does not declare an AT Protocol PDS');

  const serviceEndpoint = validatePdsServiceEndpoint(pds.serviceEndpoint);
  await assertPublicPdsHostname(serviceEndpoint);
  return serviceEndpoint;
}

export async function createAgent(handle: string, password: string): Promise<BskyAgent> {
  const service = await resolvePdsUrl(handle);
  const agent = new BskyAgent({ service });
  await agent.login({ identifier: handle, password });
  return agent;
}

/**
 * Creates an agent for an OAuth user by restoring their stored session.
 * Works with any AT Protocol PDS — service URL is discovered from the DID.
 * Throws if the OAuth session is missing or cannot be refreshed.
 */
export async function createAgentForOAuth(did: string): Promise<Agent> {
  return createOAuthAgent(did);
}

export async function fetchAllFollowers(
  agent: BskyAgent,
  targetHandle: string,
  onProgress?: (count: number, page: number) => void
): Promise<Follower[]> {
  const followers: Follower[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    page++;
    const response = await withRetry(() => agent.getFollowers({
      actor: targetHandle,
      limit: 100,
      cursor,
    }));

    const batch = response.data.followers.map((f) => ({
      did: f.did,
      handle: f.handle,
      displayName: f.displayName,
      avatar: f.avatar,
      description: f.description,
    }));

    followers.push(...batch);
    cursor = response.data.cursor;

    if (onProgress) {
      onProgress(followers.length, page);
    }

    // Small delay to avoid rate limiting
    if (cursor) {
      await new Promise((r) => setTimeout(r, 200));
    }
  } while (cursor);

  return followers;
}

export async function blockAccounts(
  agent: BskyAgent,
  dids: string[],
  batchSize = 10,
  onProgress?: (done: number, total: number, succeeded: number, failed: number) => void,
  repoDid?: string
): Promise<{ succeeded: number; failed: number; succeededDids: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const succeededDids: string[] = [];

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          const repo = repoDid ?? agent.session?.did;
          if (!repo) throw new Error('No active session');
          await withRetry(() =>
            agent.app.bsky.graph.block.create(
              { repo },
              { subject: did, createdAt: new Date().toISOString() }
            )
          );
          succeeded++;
          succeededDids.push(did);
        } catch {
          failed++;
        }
      })
    );
    if (onProgress) onProgress(Math.min(i + batchSize, dids.length), dids.length, succeeded, failed);
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed, succeededDids };
}

export async function muteAccounts(
  agent: BskyAgent,
  dids: string[],
  batchSize = 10,
  onProgress?: (done: number, total: number, succeeded: number, failed: number) => void
): Promise<{ succeeded: number; failed: number; succeededDids: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const succeededDids: string[] = [];

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          await withRetry(() => agent.mute(did));
          succeeded++;
          succeededDids.push(did);
        } catch {
          failed++;
        }
      })
    );
    if (onProgress) onProgress(Math.min(i + batchSize, dids.length), dids.length, succeeded, failed);
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed, succeededDids };
}

/**
 * One-time import of a user's existing BlueSky blocks and mutes into block_events.
 * Called on first subscription sync to warm the DB-diff cache (cold-start fix).
 * Cost: O(existing_blocks / 100) + O(existing_mutes / 100) API requests — runs once.
 */
export async function importExistingActions(
  agent: BskyAgent,
  userId: string
): Promise<{ blocksImported: number; mutesImported: number }> {
  let blocksImported = 0;
  let mutesImported = 0;

  // Import existing blocks
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.app.bsky.graph.getBlocks({ limit: 100, cursor });
      const dids = res.data.blocks.map((b) => b.did).filter(isValidDid);
      if (dids.length > 0) {
        await logBlockEvents(userId, dids, 'block', 'imported');
        blocksImported += dids.length;
      }
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 300));
    } while (cursor);
  } catch {
    // Non-fatal — best effort
  }

  // Import existing mutes
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.app.bsky.graph.getMutes({ limit: 100, cursor });
      const dids = res.data.mutes.map((m) => m.did).filter(isValidDid);
      if (dids.length > 0) {
        await logBlockEvents(userId, dids, 'mute', 'imported');
        mutesImported += dids.length;
      }
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 300));
    } while (cursor);
  } catch {
    // Non-fatal — best effort
  }

  // Mark import as done
  await query(`UPDATE users SET blocks_imported_at = NOW() WHERE id = $1`, [userId]).catch(() => {});

  return { blocksImported, mutesImported };
}

/**
 * Fetches DIDs of all accounts that have blocked `handle` using the ClearSky API.
 * ClearSky indexes public AT Protocol block relationships — no user credentials sent.
 * Server-side only. Returns raw DID strings, capped at maxResults.
 */
export async function fetchBlockedByFromClearSky(
  handle: string,
  maxResults = 5000,
  onProgress?: (count: number) => void
): Promise<string[]> {
  const dids: string[] = [];
  let page = 1;

  while (dids.length < maxResults) {
    const url = `${CLEARSKY_BASE}/api/v1/anon/single-blocklist/${encodeURIComponent(handle)}/${page}`;

    let res: Response;
    let retries = 0;
    // Plain fetch doesn't throw on 4xx/5xx — handle 429 manually with backoff
    while (true) {
      res = await fetch(url, {
        headers: { 'User-Agent': 'SkyRewall/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 && retries < 3) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
        await new Promise((r) => setTimeout(r, Math.min((isNaN(retryAfter) ? 5 : retryAfter) * 1000, 30_000)));
        retries++;
        continue;
      }
      break;
    }
    if (!res.ok) break;

    const json = await res.json() as {
      data?: { blocklist?: { did: string }[] };
    };
    const batch = json.data?.blocklist ?? [];
    if (batch.length === 0) break;

    for (const item of batch) {
      if (dids.length >= maxResults) break;
      if (typeof item.did === 'string' && isValidDid(item.did)) dids.push(item.did);
    }

    if (onProgress) onProgress(dids.length);

    if (batch.length < 100) break; // last page
    page++;

    // Respect ClearSky rate limit (5 req/s)
    await new Promise((r) => setTimeout(r, 250));
  }

  return dids;
}

/**
 * Enriches an array of DIDs with profile data (handle, displayName, avatar)
 * using BlueSky's getProfiles endpoint (max 25 per call).
 */
export async function enrichProfileBatch(
  agent: BskyAgent,
  dids: string[]
): Promise<Follower[]> {
  const results: Follower[] = [];
  const batchSize = 25;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    try {
      const res = await agent.getProfiles({ actors: batch });
      for (const p of res.data.profiles) {
        results.push({
          did: p.did,
          handle: p.handle,
          displayName: p.displayName,
          avatar: p.avatar,
          description: p.description,
        });
      }
    } catch {
      // If profile fetch fails, include DIDs with minimal info
      for (const did of batch) {
        results.push({ did, handle: did });
      }
    }
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Checks which DIDs are mutual follows of the authenticated user
 * (viewer.following && viewer.followedBy). Returns the subset of mutual DIDs.
 */
export async function checkMutuals(
  agent: BskyAgent,
  dids: string[]
): Promise<string[]> {
  const mutuals: string[] = [];
  const batchSize = 25;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    try {
      const res = await agent.getProfiles({ actors: batch });
      for (const p of res.data.profiles) {
        if (p.viewer?.following && p.viewer?.followedBy) {
          mutuals.push(p.did);
        }
      }
    } catch {
      // skip on error
    }
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return mutuals;
}

/**
 * Fetches all accounts that interacted with a post (liked, reposted, or quoted).
 * Returns a deduplicated list of Followers, capped at maxResults.
 */
export async function fetchPostInteractors(
  agent: BskyAgent,
  atUri: string,
  types: ('likes' | 'reposts' | 'quotes')[],
  maxResults = 5000,
  onProgress?: (count: number) => void
): Promise<Follower[]> {
  const seen = new Map<string, Follower>();

  const addActor = (a: { did: string; handle: string; displayName?: string; avatar?: string; description?: string }) => {
    if (!seen.has(a.did)) {
      seen.set(a.did, {
        did: a.did,
        handle: a.handle,
        displayName: a.displayName,
        avatar: a.avatar,
        description: a.description,
      });
      if (onProgress) onProgress(seen.size);
    }
  };

  if (types.includes('likes')) {
    let cursor: string | undefined;
    do {
      if (seen.size >= maxResults) break;
      const res = await withRetry(() => agent.getLikes({ uri: atUri, limit: 100, cursor }));
      for (const l of res.data.likes) addActor(l.actor);
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 250));
    } while (cursor && seen.size < maxResults);
  }

  if (types.includes('reposts')) {
    let cursor: string | undefined;
    do {
      if (seen.size >= maxResults) break;
      const res = await withRetry(() => agent.getRepostedBy({ uri: atUri, limit: 100, cursor }));
      for (const a of res.data.repostedBy) addActor(a);
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 250));
    } while (cursor && seen.size < maxResults);
  }

  if (types.includes('quotes')) {
    let cursor: string | undefined;
    do {
      if (seen.size >= maxResults) break;
      const res = await withRetry(() => agent.api.app.bsky.feed.getQuotes({ uri: atUri, limit: 100, cursor }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resAny = res.data as any;
      const feed: Array<{ post?: { author?: { did: string; handle: string; displayName?: string; avatar?: string } } }> = resAny.feed ?? [];
      for (const post of feed) {
        if (post.post?.author) addActor(post.post.author);
      }
      cursor = resAny.cursor as string | undefined;
      if (cursor) await new Promise((r) => setTimeout(r, 250));
    } while (cursor && seen.size < maxResults);
  }

  return Array.from(seen.values()).slice(0, maxResults);
}

/**
 * Fetches all members of an AT Protocol list (app.bsky.graph.list).
 * Works with both curation lists and moderation lists.
 * Returns a deduplicated list of Followers, capped at maxResults.
 */
export async function fetchListMembers(
  agent: BskyAgent,
  listUri: string,
  maxResults = 5000,
  onProgress?: (count: number) => void
): Promise<Follower[]> {
  const members: Follower[] = [];
  let cursor: string | undefined;

  do {
    const res = await withRetry(() =>
      agent.app.bsky.graph.getList({ list: listUri, limit: 100, cursor })
    );
    for (const item of res.data.items) {
      if (members.length >= maxResults) break;
      members.push({
        did: item.subject.did,
        handle: item.subject.handle,
        displayName: item.subject.displayName,
        avatar: item.subject.avatar,
        description: item.subject.description,
      });
    }
    cursor = res.data.cursor;
    if (onProgress) onProgress(members.length);
    if (cursor && members.length < maxResults) {
      await new Promise((r) => setTimeout(r, 200));
    }
  } while (cursor && members.length < maxResults);

  return members;
}

export interface BlueskyList {
  uri: string;
  name: string;
  purpose: string;
  itemCount: number;
  avatar?: string;
  description?: string;
}

/**
 * Fetches all lists created by the authenticated user (or a given actor).
 * Returns both curation lists and moderation lists.
 */
export async function fetchUserLists(
  agent: BskyAgent,
  actor?: string
): Promise<BlueskyList[]> {
  const actorId = actor ?? agent.session?.did;
  if (!actorId) throw new Error('No actor DID available');

  const lists: BlueskyList[] = [];
  let cursor: string | undefined;

  do {
    const res = await withRetry(() =>
      agent.app.bsky.graph.getLists({ actor: actorId, limit: 100, cursor })
    );
    for (const list of res.data.lists) {
      lists.push({
        uri: list.uri,
        name: list.name,
        purpose: list.purpose,
        itemCount: list.listItemCount ?? 0,
        avatar: list.avatar,
        description: list.description,
      });
    }
    cursor = res.data.cursor;
    if (cursor) await new Promise((r) => setTimeout(r, 200));
  } while (cursor);

  return lists;
}

