/**
 * Static source analysis regression tests for sync-worker.ts.
 *
 * These tests verify structural invariants in the sync worker without
 * importing it (which would require DB / Next.js). Pattern: readFileSync.
 *
 * Covers:
 *  1. sub_type → fetch function mapping is present
 *  2. Error routing: scope → flag re-auth, unavailable → pause, others → auto-pause
 *  3. OAuth-first agent resolution order in sync-worker (opposite of session-agent)
 *  4. Auto-pause threshold constant exists
 *  5. sync_failure_count is reset on success
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = readFileSync(join(root, 'src/lib/sync-worker.ts'), 'utf8');

describe('sync-worker sub_type routing', () => {
  it('handles sub_type=reblock via fetchBlockedByFromClearSky', () => {
    assert.ok(src.includes("sub_type === 'reblock'"), "missing reblock branch");
    assert.ok(src.includes('fetchBlockedByFromClearSky'), "missing fetchBlockedByFromClearSky call");
  });

  it('handles sub_type=postinteraction via fetchPostInteractors', () => {
    assert.ok(src.includes("sub_type === 'postinteraction'"), "missing postinteraction branch");
    assert.ok(src.includes('fetchPostInteractors'), "missing fetchPostInteractors call");
  });

  it('handles sub_type=list via getListMembersCached', () => {
    assert.ok(src.includes("sub_type === 'list'"), "missing list branch");
    assert.ok(src.includes('getListMembersCached'), "missing getListMembersCached call");
  });

  it('falls back to fetchAllFollowers for include_followers subscriptions', () => {
    assert.ok(src.includes('fetchAllFollowers'), "missing fetchAllFollowers call");
    assert.ok(src.includes('include_followers'), "missing include_followers check");
  });
});

describe('sync-worker error routing', () => {
  it('uses isScopeError() for scope-error detection (not a hardcoded string)', () => {
    assert.ok(src.includes('isScopeError('), "must use isScopeError() helper");
    assert.equal(
      (src.match(/\.includes\('Missing required scope'\)/g) || []).length,
      0,
      'must NOT hardcode "Missing required scope" — use isScopeError()'
    );
  });

  it('uses isTargetUnavailableError() for pause logic', () => {
    assert.ok(src.includes('isTargetUnavailableError('), "must use isTargetUnavailableError()");
  });

  it('sets paused_reason when target is unavailable', () => {
    const pauseIdx = src.indexOf('isTargetUnavailableError(');
    const pauseReasonIdx = src.indexOf('paused_reason', pauseIdx);
    assert.ok(pauseReasonIdx !== -1, 'must set paused_reason after isTargetUnavailableError');
  });

  it('increments sync_failure_count on generic failure', () => {
    assert.ok(src.includes('sync_failure_count = sync_failure_count + 1'), "must increment failure counter");
  });

  it('auto-pauses after PAUSE_THRESHOLD consecutive failures', () => {
    assert.ok(src.includes('PAUSE_THRESHOLD'), "PAUSE_THRESHOLD constant must exist");
    assert.ok(src.includes('paused_reason'), "must write paused_reason when threshold exceeded");
  });

  it('resets sync_failure_count to 0 on success', () => {
    assert.ok(
      src.includes('sync_failure_count = 0'),
      'sync_failure_count must be reset to 0 on success to prevent false auto-pause'
    );
  });
});

describe('sync-worker per-subscription timeout', () => {
  it('defines SUB_TIMEOUT_MS constant', () => {
    assert.ok(src.includes('SUB_TIMEOUT_MS'), 'SUB_TIMEOUT_MS constant must exist to prevent stuck syncs');
  });

  it('uses Promise.race with a timeout to guard each subscription', () => {
    assert.ok(src.includes('Promise.race'), 'must use Promise.race for per-subscription timeout');
    assert.ok(src.includes('SUB_TIMEOUT_MS'), 'timeout must use SUB_TIMEOUT_MS');
  });

  it('timeout error propagates to the failure counter (outer catch)', () => {
    const raceIdx = src.indexOf('Promise.race');
    const failureCounterIdx = src.indexOf('sync_failure_count = sync_failure_count + 1', raceIdx);
    assert.ok(
      failureCounterIdx > raceIdx,
      'failure counter must be incremented after Promise.race — timeout falls through to outer catch'
    );
  });

  it('processRow is defined as a nested async function', () => {
    assert.ok(
      src.includes('async function processRow('),
      'processRow must be extracted as a named async function for timeout wrapping'
    );
  });
});

describe('sync-worker agent resolution order', () => {
  it('prefers OAuth (row.did) over app-password — opposite of session-agent.ts', () => {
    const oauthFirst = src.indexOf('if (row.did)');
    const appPasswordFallback = src.indexOf('row.encrypted_password', oauthFirst);
    assert.ok(oauthFirst !== -1, 'sync-worker must check row.did (OAuth) first');
    assert.ok(appPasswordFallback > oauthFirst, 'app-password must be a fallback after OAuth in sync-worker');
  });

  it('sets oauth_error_since when OAuth session cannot be restored', () => {
    assert.ok(src.includes('oauth_error_since'), 'must record OAuth error timestamp for re-auth UI banner');
  });
});
