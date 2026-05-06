import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, createAgentForOAuth, fetchAllFollowers, blockAccounts, muteAccounts, fetchBlockedByFromClearSky, fetchPostInteractors, fetchListMembers, importExistingActions, checkMutuals, checkFollowings, addToList } from '@/lib/bluesky';
import { logBlockEvents } from '@/lib/block-events';
import { sanitizeError, isValidAtUri } from '@/lib/request-security';
import { isScopeError, isTargetUnavailableError } from '@/lib/session-utils';
import { syncState } from '@/lib/sync-state';

interface SyncRow {
  sub_id: string;
  user_id: string;
  target_handle: string;
  mode: string;
  sub_type: string;
  include_followers: boolean;
  config: Record<string, unknown>;
  handle: string;
  encrypted_password: string | null;
  did: string | null;
}

/** Returns DIDs already actioned by this user (DB-only, 0 API calls). */
async function getAlreadyActionedDids(
  userId: string,
  dids: string[],
  action: 'block' | 'mute'
): Promise<Set<string>> {
  if (dids.length === 0) return new Set();
  try {
    const rows = await query<{ target_did: string }>(
      `SELECT target_did FROM block_events WHERE user_id = $1 AND action = $2 AND target_did = ANY($3)`,
      [userId, action, dids]
    );
    return new Set(rows.map((r) => r.target_did));
  } catch {
    return new Set();
  }
}

/** Returns DIDs on the user's whitelist — these are never actioned by subscriptions. */
async function getWhitelistedDids(userId: string, dids: string[]): Promise<Set<string>> {
  if (dids.length === 0) return new Set();
  try {
    const rows = await query<{ target_did: string }>(
      `SELECT target_did FROM whitelists WHERE user_id = $1 AND target_did = ANY($2)`,
      [userId, dids]
    );
    return new Set(rows.map((r) => r.target_did));
  } catch {
    return new Set();
  }
}

/** Returns true if this user's existing BlueSky blocks have already been imported. */
async function hasImportedExistingBlocks(userId: string): Promise<boolean> {
  try {
    const rows = await query<{ blocks_imported_at: string | null }>(
      `SELECT blocks_imported_at FROM users WHERE id = $1`,
      [userId]
    );
    return rows.length > 0 && rows[0].blocks_imported_at !== null;
  } catch {
    return true; // On error, skip import to avoid accidental spam
  }
}

async function syncAllSubscriptions(): Promise<void> {
  const rows = await query<SyncRow>(`
    SELECT s.id AS sub_id, s.user_id, s.target_handle, s.mode, s.sub_type, s.include_followers, s.config,
           u.handle, u.encrypted_password, u.did
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.paused_reason IS NULL
  `);

  if (rows.length === 0) return;

  console.log(`[sync] Processing ${rows.length} subscription(s)...`);

  // Track which users have already had their cold-start import done this run
  const importedUsers = new Set<string>();

  // In-run cache: avoids redundant DB lookups for list URIs already fetched this run.
  // The persistent list_cache table (with TTL) handles cross-run deduplication.
  const inRunListCache = new Map<string, string[]>();

  const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10));

  /**
   * Returns list member DIDs for the given AT URI.
   * Checks in-run cache first, then DB list_cache (TTL = SYNC_INTERVAL_MINUTES),
   * and fetches from Bluesky only when the cache is stale or missing.
   * Only called from the sync worker — never from stateless endpoints.
   */
  async function getListMembersCached(
    listUri: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: any
  ): Promise<string[]> {
    if (inRunListCache.has(listUri)) {
      return inRunListCache.get(listUri)!;
    }

    // Check DB cache
    const cacheRows = await query<{ member_dids: string[]; fetched_at: string }>(
      `SELECT member_dids, fetched_at FROM list_cache WHERE list_uri = $1`,
      [listUri]
    ).catch(() => []);

    if (cacheRows.length > 0) {
      const ageMinutes = (Date.now() - new Date(cacheRows[0].fetched_at).getTime()) / 60_000;
      if (ageMinutes < intervalMinutes) {
        const dids = cacheRows[0].member_dids;
        inRunListCache.set(listUri, dids);
        return dids;
      }
    }

    // Cache miss or stale — fetch from Bluesky
    const members = await fetchListMembers(agent, listUri);
    const dids = members.map((m) => m.did);

    // Upsert into DB cache
    await query(
      `INSERT INTO list_cache (list_uri, member_dids, fetched_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (list_uri) DO UPDATE SET member_dids = $2, fetched_at = NOW()`,
      [listUri, dids]
    ).catch(() => {});

    inRunListCache.set(listUri, dids);
    return dids;
  }

  for (const row of rows) {
    try {
      // Resolve the agent: prefer OAuth when a DID is linked (covers both pure-OAuth
      // users and app-password accounts that were later linked via OAuth). Fall back to
      // app-password if OAuth is unavailable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let agent: any;
      let agentDid: string | undefined;
      let oauthAttempted = false;

      if (row.did) {
        oauthAttempted = true;
        try {
          agent = await createAgentForOAuth(row.did);
          agentDid = row.did;
          // OAuth session restored successfully — clear any previous error marker
          await query(
            'UPDATE users SET oauth_error_since = NULL WHERE did = $1 AND oauth_error_since IS NOT NULL',
            [row.did]
          ).catch(() => {});
        } catch (oauthErr) {
          oauthAttempted = false;
          if (row.encrypted_password) {
            // OAuth failed but we still have an app-password — fall back silently
            console.warn(`[sync] OAuth failed for ${row.handle}, falling back to app-password:`, sanitizeError(oauthErr));
            const password = decrypt(row.encrypted_password);
            agent = await createAgent(row.handle, password);
            agentDid = agent.session?.did;
          } else {
            console.error(`[sync] ✗ Could not restore OAuth session for ${row.handle} (${row.did}):`, sanitizeError(oauthErr));
            // Mark when the session first started failing (don't overwrite if already set)
            await query(
              'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
              [row.did]
            ).catch(() => {});
            continue;
          }
        }
      } else if (row.encrypted_password) {
        const password = decrypt(row.encrypted_password);
        agent = await createAgent(row.handle, password);
        agentDid = agent.session?.did;
        if (!agentDid) {
          console.warn(`[sync] ✗ subscription ${row.sub_id}: app-password login succeeded but session has no DID — skipping`);
          continue;
        }
      } else {
        console.warn(`[sync] ✗ subscription ${row.sub_id}: user has no credentials (no password and no DID) — skipping`);
        continue;
      }

      // Core processing logic, extracted so it can be retried with a different agent.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runSubscription = async (workAgent: any, workAgentDid: string | undefined) => {
        // Cold-start: import existing BlueSky blocks/mutes once per user
        if (!importedUsers.has(row.user_id)) {
          const alreadyImported = await hasImportedExistingBlocks(row.user_id);
          if (!alreadyImported) {
            console.log(`[sync] Cold-start import for ${row.handle}...`);
            const { blocksImported, mutesImported } = await importExistingActions(workAgent, row.user_id);
            console.log(`[sync] Imported ${blocksImported} blocks + ${mutesImported} mutes for ${row.handle}`);
          }
          importedUsers.add(row.user_id);
        }

        let dids: string[];

        const subscriptionConfig = (row.config as Record<string, unknown>) ?? {};

        if (row.sub_type === 'reblock') {
          dids = await fetchBlockedByFromClearSky(row.handle);
        } else if (row.sub_type === 'postinteraction') {
          const config = (row.config ?? {}) as { types?: string[] };
          const types = (config.types ?? ['likes', 'reposts', 'quotes']) as ('likes' | 'reposts' | 'quotes')[];
          const interactors = await fetchPostInteractors(workAgent, row.target_handle, types);
          dids = interactors.map((f) => f.did);
        } else if (row.sub_type === 'list') {
          const config = (row.config ?? {}) as { list_uri?: string };
          if (!config.list_uri) {
            console.warn(`[sync] ✗ subscription ${row.sub_id}: sub_type=list but config.list_uri is missing — skipping`);
            return;
          }
          dids = await getListMembersCached(config.list_uri, workAgent);
        } else if (row.include_followers) {
          const followers = await fetchAllFollowers(workAgent, row.target_handle);
          dids = followers.map((f) => f.did);
          // When followers_only is explicitly false, also action the target account itself
          if (subscriptionConfig.followers_only === false) {
            const profile = await workAgent.getProfile({ actor: row.target_handle });
            const targetProfileDid: string = profile.data.did;
            if (!dids.includes(targetProfileDid)) dids.unshift(targetProfileDid);
          }
        } else {
          const profile = await workAgent.getProfile({ actor: row.target_handle });
          dids = [profile.data.did];
        }

        // Apply dynamic exclude list if configured (block followers of X, except members of list Y)
        const excludeListUri = subscriptionConfig.exclude_list_uri;
        if (typeof excludeListUri === 'string' && isValidAtUri(excludeListUri) && dids.length > 0) {
          const excludeDids = await getListMembersCached(excludeListUri, workAgent);
          if (excludeDids.length > 0) {
            const excludeSet = new Set(excludeDids);
            const before = dids.length;
            dids = dids.filter((d) => !excludeSet.has(d));
            const excluded = before - dids.length;
            if (excluded > 0) {
              console.log(`[sync] subscription ${row.sub_id}: excluded ${excluded} DID(s) via exclude_list_uri`);
            }
          }
        }

        if (dids.length > 0) {
          const action = row.mode as 'block' | 'mute';
          const source: 'subscription' | 'reblock' | 'interaction' =
            row.sub_type === 'reblock' ? 'reblock' :
            row.sub_type === 'postinteraction' ? 'interaction' : 'subscription';

          // Filter out whitelisted DIDs (never actioned by subscriptions)
          const whitelisted = await getWhitelistedDids(row.user_id, dids);
          const nonWhitelisted = dids.filter((d) => !whitelisted.has(d));

          // Filter out DIDs already actioned in a previous sync (0 extra API calls)
          const alreadyActioned = await getAlreadyActionedDids(row.user_id, nonWhitelisted, action);
          let newDids = nonWhitelisted.filter((d) => !alreadyActioned.has(d));

          // Opt-in: protect mutuals and/or followings (costs O(N/25) getProfiles calls)
          const protectMutuals = !!subscriptionConfig.protect_mutuals;
          const protectFollowings = !!subscriptionConfig.protect_followings;
          if ((protectMutuals || protectFollowings) && newDids.length > 0) {
            const protectedMutuals = protectMutuals ? new Set(await checkMutuals(workAgent, newDids)) : new Set<string>();
            const protectedFollowings = protectFollowings ? new Set(await checkFollowings(workAgent, newDids)) : new Set<string>();
            const beforeProtect = newDids.length;
            newDids = newDids.filter((d) => !protectedMutuals.has(d) && !protectedFollowings.has(d));
            const protectedCount = beforeProtect - newDids.length;
            if (protectedCount > 0) {
              console.log(`[sync] subscription ${row.sub_id}: protected ${protectedCount} DID(s) (mutuals/followings)`);
            }
          }

          if (newDids.length > 0) {
            const { succeededDids } = action === 'block'
              ? await blockAccounts(workAgent, newDids, 10, undefined, workAgentDid)
              : await muteAccounts(workAgent, newDids);
            await logBlockEvents(row.user_id, succeededDids, action, source);

            if (typeof subscriptionConfig.add_to_list_uri === 'string' && subscriptionConfig.add_to_list_uri.startsWith('at://') && succeededDids.length > 0) {
              try {
                await addToList(workAgent, subscriptionConfig.add_to_list_uri, succeededDids, workAgentDid);
              } catch (err) {
                console.warn(`[sync] ✗ addToList failed for subscription ${row.sub_id}:`, err);
              }
            }
          }

          const skipped = alreadyActioned.size;
          const wlSkipped = whitelisted.size;
          console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}/${row.sub_type}, ${newDids.length} new, ${skipped} skipped, ${wlSkipped} whitelisted)`);
        } else {
          console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}/${row.sub_type}, 0 accounts)`);
        }

        await query('UPDATE subscriptions SET last_updated = NOW() WHERE id = $1', [row.sub_id]);
      };

      try {
        await runSubscription(agent, agentDid);
      } catch (workErr) {
        const errMsg = workErr instanceof Error ? workErr.message : String(workErr);
        // If the OAuth token is missing required scopes and app-password is available,
        // fall back to app-password for this run and flag the user for re-auth.
        if (isScopeError(errMsg) && oauthAttempted && row.encrypted_password) {
          console.warn(`[sync] OAuth scope insufficient for ${row.handle} — retrying with app-password, flagging for re-auth`);
          await query(
            'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
            [row.did]
          ).catch(() => {});
          const password = decrypt(row.encrypted_password);
          const appAgent = await createAgent(row.handle, password);
          await runSubscription(appAgent, appAgent.session?.did);
        } else if (isScopeError(errMsg) && row.did) {
          // Pure OAuth user — no fallback, just flag for re-auth
          console.error(`[sync] ✗ subscription ${row.sub_id} failed: ${errMsg}`);
          await query(
            'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
            [row.did]
          ).catch(() => {});
        } else if (isTargetUnavailableError(errMsg)) {
          // Target account is permanently gone — pause the subscription
          const reason = `Target account unavailable: ${errMsg.slice(0, 120)}`;
          console.warn(`[sync] ⏸ subscription ${row.sub_id} paused — ${reason}`);
          await query(
            'UPDATE subscriptions SET paused_reason = $1 WHERE id = $2',
            [reason, row.sub_id]
          ).catch(() => {});
        } else {
          throw workErr;
        }
      }
    } catch (err) {
      console.error(`[sync] ✗ subscription ${row.sub_id} failed:`, sanitizeError(err));
    }

    // Small inter-subscription pause to avoid burst rate-limit when a user has many subscriptions
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function startSyncWorker(): void {
  const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  syncState.intervalMinutes = intervalMinutes;

  console.log(`[sync] Worker started — interval: ${intervalMinutes} min`);

  let syncRunning = false;

  async function runSync(label: string): Promise<void> {
    if (syncRunning) {
      console.warn(`[sync] ${label} skipped — previous run still in progress`);
      return;
    }
    syncRunning = true;
    try {
      await syncAllSubscriptions();
      syncState.lastRunAt = new Date();
    } catch (err) {
      console.error(`[sync] ${label} failed:`, sanitizeError(err));
    } finally {
      syncRunning = false;
      syncState.nextRunAt = new Date(Date.now() + intervalMs);
    }
  }

  const initialDelayMs = 10_000;
  syncState.nextRunAt = new Date(Date.now() + initialDelayMs);
  setTimeout(() => runSync('Initial run'), initialDelayMs);
  setInterval(() => { runSync('Scheduled run').catch(() => {}); }, intervalMs);
}

