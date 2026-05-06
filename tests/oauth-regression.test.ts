/**
 * Regression tests for OAuth/App-Password integration.
 *
 * These tests verify critical invariants that were changed or introduced
 * during the OAuth scope fix and session-agent rework:
 *
 *  1. OAuth client scope string — must include "transition:generic" for
 *     getFollowers and other PII-requiring methods.
 *  2. session-agent resolution order — app-password first, OAuth second.
 *  3. Scope error detection string — must match what Bluesky actually returns.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('OAuth scope configuration', () => {
  it('oauth-client.ts declares "transition:generic" scope', () => {
    const src = readFileSync(join(root, 'src/lib/oauth-client.ts'), 'utf8');
    assert.ok(
      src.includes('transition:generic'),
      'oauth-client.ts must request "transition:generic" scope. ' +
      'Removing it breaks getFollowers and other follower-based subscriptions.'
    );
  });

  it('oauth-client.ts does NOT use the old "transition:chat.bsky" scope alone', () => {
    const src = readFileSync(join(root, 'src/lib/oauth-client.ts'), 'utf8');
    // If the old-only scope is present without transition:generic that would be a regression
    if (src.includes('transition:chat.bsky') && !src.includes('transition:generic')) {
      assert.fail(
        'oauth-client.ts uses deprecated scope "transition:chat.bsky" without "transition:generic"'
      );
    }
  });
});

describe('Scope error detection', () => {
  it('isScopeError matches the exact Bluesky error format seen in production logs', () => {
    // This string was observed in live logs:
    //   Missing required scope "rpc:app.bsky.graph.getFollowers?aud=did:web:api.bsky.app"
    // The substring check must match it precisely.
    const { isScopeError } = require('../src/lib/session-utils');
    const liveError = 'Missing required scope "rpc:app.bsky.graph.getFollowers?aud=did:web:api.bsky.app"';
    assert.ok(isScopeError(liveError), 'isScopeError must detect the live production scope error');
  });

  it('sync-worker uses isScopeError (not a hardcoded string) for scope detection', () => {
    const src = readFileSync(join(root, 'src/lib/sync-worker.ts'), 'utf8');
    assert.ok(
      src.includes('isScopeError('),
      'sync-worker.ts must use isScopeError() helper — prevents drift if the error string changes'
    );
    assert.equal(
      (src.match(/\.includes\('Missing required scope'\)/g) || []).length,
      0,
      'sync-worker.ts must NOT contain hardcoded "Missing required scope" includes — use isScopeError()'
    );
  });
});

describe('session-agent resolution order', () => {
  it('session-agent.ts tries app-password before OAuth', () => {
    const src = readFileSync(join(root, 'src/lib/session-agent.ts'), 'utf8');
    // Check the conditional logic, not the import — app-password if-block comes first
    const appPassCondition = src.indexOf('if (encrypted_password)');
    const oauthFallback = src.indexOf('createAgentForOAuth(');
    assert.ok(appPassCondition !== -1, 'session-agent.ts must have an encrypted_password check');
    assert.ok(oauthFallback !== -1, 'session-agent.ts must reference createAgentForOAuth (OAuth fallback)');
    assert.ok(
      appPassCondition < oauthFallback,
      'session-agent.ts must attempt app-password BEFORE OAuth fallback'
    );
  });

  it('session-agent.ts rejects cross-user fallback (userId scoped query)', () => {
    const src = readFileSync(join(root, 'src/lib/session-agent.ts'), 'utf8');
    // The DB query must filter by userId to prevent an OAuth agent from being
    // returned for a different user's account if app-password decryption fails
    assert.ok(
      src.includes('WHERE id = $1') || src.includes('where id ='),
      'session-agent.ts must scope the DB query to the current userId'
    );
  });
});

describe('API routes use getSessionAgent not getSessionCredentials', () => {
  const blueskyRoutes = [
    'src/app/api/bluesky/block/route.ts',
    'src/app/api/bluesky/mute/route.ts',
    'src/app/api/bluesky/followers/route.ts',
    'src/app/api/bluesky/lists/route.ts',
    'src/app/api/bluesky/list-members/route.ts',
    'src/app/api/bluesky/post-interactions/route.ts',
    'src/app/api/bluesky/check-mutuals/route.ts',
    'src/app/api/bluesky/check-blockedby/route.ts',
  ];

  for (const routePath of blueskyRoutes) {
    it(`${routePath} uses getSessionAgent for stateful auth`, () => {
      const src = readFileSync(join(root, routePath), 'utf8');
      assert.ok(
        src.includes('getSessionAgent'),
        `${routePath} must use getSessionAgent() — pure OAuth users need it`
      );
    });
  }
});
