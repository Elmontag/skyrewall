/**
 * Unit tests for pure session utility functions.
 * These functions have no Next.js or database dependencies and can
 * be run with `tsx --test` against the raw TypeScript source.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { isValidDid, isScopeError } from '../src/lib/session-utils';

describe('isValidDid', () => {
  it('accepts standard did:plc identifiers', () => {
    assert.ok(isValidDid('did:plc:abc123'));
    assert.ok(isValidDid('did:plc:ewvi7nxzyoun2507'));
  });

  it('accepts did:web identifiers (host and path forms)', () => {
    assert.ok(isValidDid('did:web:bsky.social'));
    assert.ok(isValidDid('did:web:example.com:users:alice'));
  });

  it('rejects empty strings and non-did values', () => {
    assert.equal(isValidDid(''), false);
    assert.equal(isValidDid('not-a-did'), false);
    assert.equal(isValidDid('@handle.bsky.social'), false);
  });

  it('rejects malformed did: values (no method segment)', () => {
    assert.equal(isValidDid('did:'), false);
    assert.equal(isValidDid('did::abc'), false);
  });

  it('rejects DIDs with method starting with uppercase letters', () => {
    // AT Protocol DIDs must use lowercase method
    assert.equal(isValidDid('did:PLC:abc123'), false);
  });

  it('rejects excessively long DIDs (> 512 chars in identifier segment)', () => {
    const longId = 'a'.repeat(513);
    assert.equal(isValidDid(`did:plc:${longId}`), false);
  });
});

describe('isScopeError', () => {
  it('detects the exact scope error message Bluesky returns', () => {
    const msg = 'Missing required scope "rpc:app.bsky.graph.getFollowers?aud=did:web:api.bsky.app"';
    assert.ok(isScopeError(msg));
  });

  it('detects scope error embedded in a longer error string', () => {
    assert.ok(isScopeError('Error: Missing required scope "transition:generic"'));
  });

  it('returns false for unrelated error messages', () => {
    assert.equal(isScopeError('Unauthorized'), false);
    assert.equal(isScopeError('Network request failed'), false);
    assert.equal(isScopeError(''), false);
  });
});

describe('parseSession', () => {
  before(() => {
    // parseSession needs ENCRYPTION_KEY for verifySession (HMAC-SHA256)
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex string
  });

  after(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('validates and parses a freshly created session token', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const { parseSession } = await import('../src/lib/session-utils');

    const iat = Math.floor(Date.now() / 1000);
    const token = signSession(JSON.stringify({ userId: 'user-42', iat }));
    const result = parseSession(token);
    assert.deepEqual(result, { userId: 'user-42' });
  });

  it('rejects a token that has been tampered with', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const { parseSession } = await import('../src/lib/session-utils');

    const token = signSession(JSON.stringify({ userId: 'user-42', iat: Math.floor(Date.now() / 1000) }));
    const tampered = token.slice(0, -4) + 'dead'; // corrupt signature
    assert.equal(parseSession(tampered), null);
  });

  it('rejects an expired session token', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const { parseSession, SESSION_MAX_AGE_SECONDS } = await import('../src/lib/session-utils');

    const expiredIat = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SECONDS - 1;
    const token = signSession(JSON.stringify({ userId: 'user-42', iat: expiredIat }));
    assert.equal(parseSession(token), null);
  });

  it('rejects a token with no userId field', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const { parseSession } = await import('../src/lib/session-utils');

    const token = signSession(JSON.stringify({ iat: Math.floor(Date.now() / 1000) }));
    assert.equal(parseSession(token), null);
  });

  it('rejects malformed JSON payload', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const { parseSession } = await import('../src/lib/session-utils');

    const token = signSession('not-json');
    assert.equal(parseSession(token), null);
  });
});
