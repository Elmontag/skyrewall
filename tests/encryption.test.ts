/**
 * Unit tests for AES-256-GCM encryption and HMAC session signing.
 * Verifies that credential storage and session integrity mechanisms
 * behave correctly before and after the OAuth/App-Password rework.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

const TEST_KEY = 'deadbeef'.repeat(8); // 64-char hex = 32-byte key

describe('AES-256-GCM encrypt / decrypt', () => {
  before(() => { process.env.ENCRYPTION_KEY = TEST_KEY; });
  after(() => { delete process.env.ENCRYPTION_KEY; });

  it('roundtrip: decrypts back to the original plaintext', async () => {
    const { encrypt, decrypt } = await import('../src/lib/encryption');
    const plaintext = 'my-super-secret-app-password';
    assert.equal(decrypt(encrypt(plaintext)), plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random salt + IV)', async () => {
    const { encrypt } = await import('../src/lib/encryption');
    const c1 = encrypt('same');
    const c2 = encrypt('same');
    assert.notEqual(c1, c2);
  });

  it('throws on tampered ciphertext (GCM auth tag verification)', async () => {
    const { encrypt, decrypt } = await import('../src/lib/encryption');
    const ciphertext = encrypt('sensitive');
    const parts = ciphertext.split(':');
    // Flip a byte in the encrypted payload (last segment)
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('aa') ? 'bb' : 'aa');
    assert.throws(() => decrypt(parts.join(':')));
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    const { encrypt } = await import('../src/lib/encryption');
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      assert.throws(() => encrypt('test'), /ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = saved;
    }
  });
});

describe('HMAC session signing (signSession / verifySession)', () => {
  before(() => { process.env.ENCRYPTION_KEY = TEST_KEY; });
  after(() => { delete process.env.ENCRYPTION_KEY; });

  it('verifies a freshly signed payload', async () => {
    const { signSession, verifySession } = await import('../src/lib/encryption');
    const payload = 'hello-world';
    const token = signSession(payload);
    assert.equal(verifySession(token), payload);
  });

  it('returns null for a tampered token', async () => {
    const { signSession, verifySession } = await import('../src/lib/encryption');
    const token = signSession('payload');
    // Strip last 2 chars of hex signature and replace with different value
    const bad = token.slice(0, -2) + (token.endsWith('ff') ? '00' : 'ff');
    assert.equal(verifySession(bad), null);
  });

  it('returns null when ENCRYPTION_KEY is missing', async () => {
    const { signSession, verifySession } = await import('../src/lib/encryption');
    const token = signSession('test');
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      assert.equal(verifySession(token), null);
    } finally {
      process.env.ENCRYPTION_KEY = saved;
    }
  });

  it('uses the v1: prefix format', async () => {
    const { signSession } = await import('../src/lib/encryption');
    const token = signSession('test-payload');
    assert.ok(token.startsWith('v1:'), `Expected v1: prefix, got: ${token.slice(0, 10)}`);
  });

  it('is resistant to signature length extension (payload contains dots)', async () => {
    // A payload with dots should not fool the lastIndexOf('.') separator logic
    const { signSession, verifySession } = await import('../src/lib/encryption');
    const dottyPayload = JSON.stringify({ userId: 'a.b.c', iat: 1000000 });
    const token = signSession(dottyPayload);
    assert.equal(verifySession(token), dottyPayload);
  });
});
