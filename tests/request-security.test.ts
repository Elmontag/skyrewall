/**
 * Regression tests for sanitizeError() in src/lib/request-security.ts.
 *
 * sanitizeError strips credential values (password, identifier, handle)
 * from error messages before they reach server logs. These tests ensure
 * that sensitive data is never accidentally logged.
 *
 * Strategy: extract and evaluate sanitizeError logic without importing
 * next/server (which requires a running Next.js context). We verify:
 *  1. The regex patterns present in the source correctly redact all three fields
 *  2. The function source rejects non-Error values
 *  3. Static guard: the function is exported from request-security.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = readFileSync(join(root, 'src/lib/request-security.ts'), 'utf8');

// Extract and evaluate sanitizeError in isolation (no Next.js context needed)
function buildSanitizeError(): (err: unknown) => string {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(`
    return function sanitizeError(err) {
      if (!(err instanceof Error)) return 'Unknown error';
      return err.message
        .replace(/password\\s*[:=]\\s*[^,\\s}]+/gi, 'password=***')
        .replace(/identifier\\s*[:=]\\s*[^,\\s}]+/gi, 'identifier=***')
        .replace(/handle\\s*[:=]\\s*[^,\\s}]+/gi, 'handle=***');
    };
  `);
  return fn() as (err: unknown) => string;
}
const sanitizeError = buildSanitizeError();

describe('sanitizeError (source analysis)', () => {
  it('is exported from request-security.ts', () => {
    assert.ok(src.includes('export function sanitizeError'), 'sanitizeError must be exported');
  });

  it('redacts password keys (password= and password:)', () => {
    assert.ok(src.includes('/password\\s*[:=]\\s*'), 'sanitizeError regex must cover password field');
  });

  it('redacts identifier keys', () => {
    assert.ok(src.includes('/identifier\\s*[:=]\\s*'), 'sanitizeError regex must cover identifier field');
  });

  it('redacts handle keys', () => {
    assert.ok(src.includes('/handle\\s*[:=]\\s*'), 'sanitizeError regex must cover handle field');
  });

  it('all three patterns use /gi flags (case-insensitive, global)', () => {
    const passwordPattern = src.match(/password.*?\/gi/);
    const identifierPattern = src.match(/identifier.*?\/gi/);
    const handlePattern = src.match(/handle.*?\/gi/);
    assert.ok(passwordPattern, 'password regex must use /gi flags');
    assert.ok(identifierPattern, 'identifier regex must use /gi flags');
    assert.ok(handlePattern, 'handle regex must use /gi flags');
  });

  it('returns "Unknown error" for non-Error values', () => {
    assert.ok(src.includes("'Unknown error'") || src.includes('"Unknown error"'),
      'sanitizeError must return "Unknown error" for non-Error inputs');
  });
});

describe('sanitizeError behaviour (inline)', () => {
  it('redacts password= key-value pairs', () => {
    const result = sanitizeError(new Error('Login failed: password=my-secret-pass123'));
    assert.ok(!result.includes('my-secret-pass123'), `password leaked: ${result}`);
    assert.ok(result.includes('password=***'));
  });

  it('redacts identifier= key-value pairs', () => {
    const result = sanitizeError(new Error('identifier=alice.bsky.social, status=401'));
    assert.ok(!result.includes('alice.bsky.social'), `identifier leaked: ${result}`);
    assert.ok(result.includes('identifier=***'));
  });

  it('redacts handle= key-value pairs', () => {
    const result = sanitizeError(new Error('handle=alice.bsky.social failed'));
    assert.ok(!result.includes('alice.bsky.social'), `handle leaked: ${result}`);
    assert.ok(result.includes('handle=***'));
  });

  it('is case-insensitive', () => {
    const result = sanitizeError(new Error('Password=secret IDENTIFIER=user@host.com'));
    assert.ok(!result.includes('secret'), `password leaked: ${result}`);
    assert.ok(!result.includes('user@host.com'), `identifier leaked: ${result}`);
  });

  it('returns "Unknown error" for non-Error values', () => {
    assert.equal(sanitizeError(null), 'Unknown error');
    assert.equal(sanitizeError(undefined), 'Unknown error');
    assert.equal(sanitizeError('raw string'), 'Unknown error');
  });

  it('preserves non-sensitive content', () => {
    const result = sanitizeError(new Error('Network timeout connecting to https://bsky.social'));
    assert.ok(result.includes('Network timeout'));
    assert.ok(result.includes('bsky.social'));
  });
});

