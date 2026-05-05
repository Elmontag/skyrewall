import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { didWebToDocumentUrl, isUnsafeHost, validatePdsServiceEndpoint } from '../src/lib/pds';

describe('PDS endpoint validation', () => {
  it('accepts public HTTPS PDS endpoints', () => {
    assert.equal(validatePdsServiceEndpoint('https://eurosky.social/'), 'https://eurosky.social');
  });

  it('rejects endpoints that could leak credentials to unsafe destinations', () => {
    assert.throws(() => validatePdsServiceEndpoint('http://eurosky.social'), /HTTPS/);
    assert.throws(() => validatePdsServiceEndpoint('https://user:pass@eurosky.social'), /credentials/);
    assert.throws(() => validatePdsServiceEndpoint('https://127.0.0.1'), /not allowed/);
    assert.throws(() => validatePdsServiceEndpoint('https://192.168.1.10'), /not allowed/);
    assert.throws(() => validatePdsServiceEndpoint('https://eurosky.social:8443'), /unsupported port/);
  });

  it('flags localhost and private IP hosts as unsafe', () => {
    assert.equal(isUnsafeHost('localhost'), true);
    assert.equal(isUnsafeHost('api.localhost'), true);
    assert.equal(isUnsafeHost('10.0.0.1'), true);
    assert.equal(isUnsafeHost('172.16.0.1'), true);
    assert.equal(isUnsafeHost('::1'), true);
    assert.equal(isUnsafeHost('eurosky.social'), false);
  });
});

describe('did:web document URL mapping', () => {
  it('maps host-only did:web identifiers to well-known DID documents', () => {
    assert.equal(
      didWebToDocumentUrl('did:web:eurosky.social'),
      'https://eurosky.social/.well-known/did.json'
    );
  });

  it('maps path-based did:web identifiers without falling back to the host root', () => {
    assert.equal(
      didWebToDocumentUrl('did:web:example.com:users:alice'),
      'https://example.com/users/alice/did.json'
    );
  });

  it('rejects did:web identifiers that point at local services', () => {
    assert.throws(() => didWebToDocumentUrl('did:web:localhost%3A3000'), /not allowed/);
    assert.throws(() => didWebToDocumentUrl('did:web:127.0.0.1'), /not allowed/);
  });
});
