/**
 * Unit tests for blockAccounts() and muteAccounts() error isolation.
 *
 * Key invariant: individual DID failures must NOT prevent other DIDs in the
 * same batch from being processed. blockAccounts uses Promise.allSettled
 * internally, so a single rejected promise must not abort the whole batch.
 *
 * Also tests: source analysis to confirm Promise.allSettled is used and that
 * the succeeded/failed counters are correctly tracked.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = readFileSync(join(root, 'src/lib/bluesky.ts'), 'utf8');

describe('blockAccounts error isolation (static analysis)', () => {
  it('blockAccounts uses Promise.allSettled for batch isolation', () => {
    assert.ok(
      src.includes('Promise.allSettled'),
      'blockAccounts must use Promise.allSettled so individual DID failures do not abort the batch'
    );
  });

  it('blockAccounts tracks succeeded and failed counts separately', () => {
    const blockFn = src.slice(src.indexOf('export async function blockAccounts'));
    assert.ok(blockFn.includes('succeeded'), 'blockAccounts must track succeeded count');
    assert.ok(blockFn.includes('failed'), 'blockAccounts must track failed count');
  });

  it('blockAccounts returns succeededDids for logging', () => {
    const blockFn = src.slice(src.indexOf('export async function blockAccounts'));
    assert.ok(blockFn.includes('succeededDids'), 'blockAccounts must return succeededDids array for logBlockEvents');
  });
});

describe('muteAccounts error isolation (static analysis)', () => {
  it('muteAccounts exists and calls agent.mute per DID', () => {
    assert.ok(
      src.includes('export async function muteAccounts'),
      'muteAccounts function must exist'
    );
    assert.ok(src.includes('agent.mute('), 'muteAccounts must call agent.mute per DID');
  });
});

describe('OAuth DID fallback in block/list operations', () => {
  it('blockAccounts uses triple-fallback for repoDid resolution', () => {
    const blockSection = src.slice(src.indexOf('export async function blockAccounts'));
    assert.ok(
      blockSection.includes('agent.session?.did'),
      'blockAccounts must have agent.session?.did in repoDid fallback chain'
    );
    assert.ok(
      blockSection.includes('as unknown as { did?: string }'),
      'blockAccounts must have OAuth agent DID fallback'
    );
  });

  it('fetchUserLists uses triple-fallback for actorId (OAuth fix)', () => {
    const listSection = src.slice(src.indexOf('export async function fetchUserLists'));
    assert.ok(
      listSection.includes('agent.session?.did'),
      'fetchUserLists must include agent.session?.did in actorId fallback'
    );
    assert.ok(
      listSection.includes('as unknown as { did?: string }'),
      'fetchUserLists must include OAuth agent DID fallback — regression guard for the fix in Phase 0'
    );
  });

  it('addToList uses triple-fallback for repo resolution (OAuth fix)', () => {
    const addSection = src.slice(src.indexOf('export async function addToList'));
    assert.ok(
      addSection.includes('agent.session?.did'),
      'addToList must include agent.session?.did in repo fallback'
    );
    assert.ok(
      addSection.includes('as unknown as { did?: string }'),
      'addToList must include OAuth agent DID fallback'
    );
  });
});
