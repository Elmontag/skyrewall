import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, createAgentForOAuth, fetchAllFollowers, blockAccounts, muteAccounts, fetchBlockedByFromClearSky, fetchPostInteractors, fetchListMembers, importExistingActions, checkMutuals, checkFollowings, addToList } from '@/lib/bluesky';
import { logBlockEvents } from '@/lib/block-events';
import { sanitizeError, isValidAtUri } from '@/lib/request-security';
import { isScopeError, isTargetUnavailableError } from '@/lib/session-utils';
import { syncState } from '@/lib/sync-state';
import { createLogger } from '@/lib/logger';

const log = createLogger('sync');

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

  log.info('run-start', { subscriptions: rows.length });

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

  async function processRow(row: SyncRow): Promise<void> {
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
        await query(
          'UPDATE users SET oauth_error_since = NULL WHERE did = $1 AND oauth_error_since IS NOT NULL',
          [row.did]
        ).catch(() => {});
      } catch (oauthErr) {
        oauthAttempted = false;
        if (row.encrypted_password) {
          log.warn('oauth-fallback', { handle: row.handle, error: sanitizeError(oauthErr) });
          const password = decrypt(row.encrypted_password);
          agent = await createAgent(row.handle, password);
          agentDid = agent.session?.did;
        } else {
          log.error('oauth-failed', { handle: row.handle, did: row.did, error: sanitizeError(oauthErr) });
          await query(
            'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
            [row.did]
          ).catch(() => {});
          return;
        }
      }
    } else if (row.encrypted_password) {
      const password = decrypt(row.encrypted_password);
      agent = await createAgent(row.handle, password);
      agentDid = agent.session?.did;
      if (!agentDid) {
        log.warn('no-agent-did', { subId: row.sub_id });
        return;
      }
    } else {
      log.warn('no-credentials', { subId: row.sub_id });
      return;
    }

    // Best-effort: extract the PDS hostname for observability (bsky.social vs custom PDS).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pds: string = (() => { try { const a = agent as any; return a?.service?.hostname ?? a?.serviceUrl?.hostname ?? 'unknown'; } catch { return 'unknown'; } })();
    const authMethod = oauthAttempted ? 'oauth' : 'app-password';
    log.info('agent-resolved', { subId: row.sub_id, handle: row.handle, pds, authMethod });

    // Core processing logic, extracted so it can be retried with a different agent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runSubscription = async (workAgent: any, workAgentDid: string | undefined) => {
      if (!importedUsers.has(row.user_id)) {
        const alreadyImported = await hasImportedExistingBlocks(row.user_id);
        if (!alreadyImported) {
          log.info('cold-start-import', { handle: row.handle });
          const { blocksImported, mutesImported } = await importExistingActions(workAgent, row.user_id);
          log.info('cold-start-import-done', { handle: row.handle, blocksImported, mutesImported });
        }
        importedUsers.add(row.user_id);
      }

      let dids: string[];
      const subscriptionConfig = (row.config as Record<string, unknown>) ?? {};

      // Describe the subscription mode for log readability
      const listUri = row.sub_type === 'list' ? (subscriptionConfig.list_uri as string | undefined) : undefined;
      const followersOnly = subscriptionConfig.followers_only !== false; // default true
      const excludeListUri = typeof subscriptionConfig.exclude_list_uri === 'string' ? subscriptionConfig.exclude_list_uri : undefined;
      const addToListUri = typeof subscriptionConfig.add_to_list_uri === 'string' ? subscriptionConfig.add_to_list_uri : undefined;
      const protectMutuals = !!subscriptionConfig.protect_mutuals;
      const protectFollowings = !!subscriptionConfig.protect_followings;

      log.info('sub-start', {
        subId: row.sub_id,
        handle: row.handle,
        target: row.target_handle,
        mode: row.mode,
        subType: row.sub_type,
        ...(listUri ? { listUri } : {}),
        ...(row.include_followers ? { followersOnly, ...(excludeListUri ? { excludeList: true } : {}) } : {}),
        ...(protectMutuals ? { protectMutuals } : {}),
        ...(protectFollowings ? { protectFollowings } : {}),
        ...(addToListUri ? { addToList: true } : {}),
      });

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
          log.warn('missing-list-uri', { subId: row.sub_id });
          return;
        }
        dids = await getListMembersCached(config.list_uri, workAgent);
      } else if (row.include_followers) {
        const followers = await fetchAllFollowers(workAgent, row.target_handle);
        dids = followers.map((f) => f.did);
        if (!followersOnly) {
          const profile = await workAgent.getProfile({ actor: row.target_handle });
          const targetProfileDid: string = profile.data.did;
          if (!dids.includes(targetProfileDid)) dids.unshift(targetProfileDid);
        }
      } else {
        const profile = await workAgent.getProfile({ actor: row.target_handle });
        dids = [profile.data.did];
      }

      if (excludeListUri && isValidAtUri(excludeListUri) && dids.length > 0) {
        const excludeDids = await getListMembersCached(excludeListUri, workAgent);
        if (excludeDids.length > 0) {
          const excludeSet = new Set(excludeDids);
          const before = dids.length;
          dids = dids.filter((d) => !excludeSet.has(d));
          const excluded = before - dids.length;
          if (excluded > 0) log.debug('exclude-list', { subId: row.sub_id, excluded });
        }
      }

      if (dids.length > 0) {
        const action = row.mode as 'block' | 'mute';
        const source: 'subscription' | 'reblock' | 'interaction' =
          row.sub_type === 'reblock' ? 'reblock' :
          row.sub_type === 'postinteraction' ? 'interaction' : 'subscription';

        const whitelisted = await getWhitelistedDids(row.user_id, dids);
        const nonWhitelisted = dids.filter((d) => !whitelisted.has(d));
        const alreadyActioned = await getAlreadyActionedDids(row.user_id, nonWhitelisted, action);
        let newDids = nonWhitelisted.filter((d) => !alreadyActioned.has(d));

        if ((protectMutuals || protectFollowings) && newDids.length > 0) {
          const protectedMutuals = protectMutuals ? new Set(await checkMutuals(workAgent, newDids)) : new Set<string>();
          const protectedFollowings = protectFollowings ? new Set(await checkFollowings(workAgent, newDids)) : new Set<string>();
          const beforeProtect = newDids.length;
          newDids = newDids.filter((d) => !protectedMutuals.has(d) && !protectedFollowings.has(d));
          const protectedCount = beforeProtect - newDids.length;
          if (protectedCount > 0) log.debug('protected-accounts', { subId: row.sub_id, protectedCount });
        }

        if (newDids.length > 0) {
          const { succeededDids } = action === 'block'
            ? await blockAccounts(workAgent, newDids, 10, undefined, workAgentDid)
            : await muteAccounts(workAgent, newDids);
          await logBlockEvents(row.user_id, succeededDids, action, source);

          if (addToListUri && succeededDids.length > 0) {
            try {
              await addToList(workAgent, addToListUri, succeededDids, workAgentDid);
            } catch (err) {
              log.warn('add-to-list-failed', { subId: row.sub_id, error: sanitizeError(err) });
            }
          }
        }

        const skipped = alreadyActioned.size;
        const wlSkipped = whitelisted.size;
        const completeMeta: Record<string, unknown> = {
          subId: row.sub_id, handle: row.handle, target: row.target_handle,
          mode: row.mode, subType: row.sub_type,
          newDids: newDids.length, skipped, whitelisted: wlSkipped,
          ...(listUri ? { listUri } : {}),
          ...(row.include_followers ? { followersOnly, ...(excludeListUri ? { excludeList: true } : {}) } : {}),
          ...(protectMutuals ? { protectMutuals } : {}),
          ...(protectFollowings ? { protectFollowings } : {}),
          ...(addToListUri ? { addToList: true } : {}),
        };
        log.info('sub-complete', completeMeta);
      } else {
        log.info('sub-complete', {
          subId: row.sub_id, handle: row.handle, target: row.target_handle,
          mode: row.mode, subType: row.sub_type, newDids: 0,
          ...(listUri ? { listUri } : {}),
          ...(row.include_followers ? { followersOnly, ...(excludeListUri ? { excludeList: true } : {}) } : {}),
        });
      }

      await query('UPDATE subscriptions SET last_updated = NOW(), sync_failure_count = 0 WHERE id = $1', [row.sub_id]);
    };

    try {
      await runSubscription(agent, agentDid);
    } catch (workErr) {
      const errMsg = workErr instanceof Error ? workErr.message : String(workErr);
      if (isScopeError(errMsg) && oauthAttempted && row.encrypted_password) {
        log.warn('scope-error-fallback', { handle: row.handle, subId: row.sub_id });
        await query(
          'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
          [row.did]
        ).catch(() => {});
        const password = decrypt(row.encrypted_password);
        const appAgent = await createAgent(row.handle, password);
        await runSubscription(appAgent, appAgent.session?.did);
      } else if (isScopeError(errMsg) && row.did) {
        log.error('scope-error-no-fallback', { subId: row.sub_id, error: errMsg });
        await query(
          'UPDATE users SET oauth_error_since = NOW() WHERE did = $1 AND oauth_error_since IS NULL',
          [row.did]
        ).catch(() => {});
      } else if (isTargetUnavailableError(errMsg)) {
        const reason = `Target account unavailable: ${errMsg.slice(0, 120)}`;
        log.warn('target-unavailable', { subId: row.sub_id, reason });
        await query(
          'UPDATE subscriptions SET paused_reason = $1 WHERE id = $2',
          [reason, row.sub_id]
        ).catch(() => {});
      } else {
        throw workErr;
      }
    }
  }

  // Maximum wall-clock time allowed for a single subscription (agent creation + all API calls).
  // If exceeded, the subscription counts as a failure for auto-pause purposes.
  const SUB_TIMEOUT_MS = 5 * 60 * 1000;

  for (const row of rows) {
    try {
      await Promise.race([
        processRow(row),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Subscription timed out after ${SUB_TIMEOUT_MS / 1000}s`)),
            SUB_TIMEOUT_MS
          )
        ),
      ]);
    } catch (err) {
      log.error('sub-failed', { subId: row.sub_id, error: sanitizeError(err) });
      // Increment the consecutive-failure counter; auto-pause after threshold to stop
      // flooding logs and burning API quota on permanently broken subscriptions.
      const PAUSE_THRESHOLD = 5;
      try {
        const updated = await query<{ sync_failure_count: number; handle: string; target_handle: string }>(
          `UPDATE subscriptions
           SET sync_failure_count = sync_failure_count + 1
           WHERE id = $1
           RETURNING sync_failure_count`,
          [row.sub_id]
        );
        const failures = updated[0]?.sync_failure_count ?? 0;
        if (failures >= PAUSE_THRESHOLD) {
          const reason = `Auto-paused after ${failures} consecutive sync failures. Last error: ${sanitizeError(err).slice(0, 120)}`;
          log.warn('auto-paused', { subId: row.sub_id, failures, error: sanitizeError(err) });
          await query(
            'UPDATE subscriptions SET paused_reason = $1 WHERE id = $2 AND paused_reason IS NULL',
            [reason, row.sub_id]
          );
        }
      } catch {
        // best-effort — failure counter update is non-fatal
      }
    }

    // Small inter-subscription pause to avoid burst rate-limit when a user has many subscriptions
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function startSyncWorker(): void {
  const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  syncState.intervalMinutes = intervalMinutes;

  log.info('worker-start', { intervalMinutes });

  let syncRunning = false;

  async function runSync(label: string): Promise<void> {
    if (syncRunning) {
      log.warn('run-skipped', { label });
      return;
    }
    syncRunning = true;
    try {
      await syncAllSubscriptions();
      syncState.lastRunAt = new Date();
    } catch (err) {
      log.error('run-failed', { label, error: sanitizeError(err) });
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

