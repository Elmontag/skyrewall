/**
 * Static regression tests for fetch functions in src/lib/bluesky.ts.
 *
 * These verify structural correctness of:
 *  - fetchListMembers: pagination cursor loop, max-items guard
 *  - fetchAllFollowers: pagination, progress callback
 *  - fetchPostInteractors: multi-type fetching, deduplication
 *
 * We use source analysis (readFileSync) because the functions require a
 * live BskyAgent (which needs a PDS connection) that cannot be easily mocked
 * in the Node.js test runner without Next.js internals.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = readFileSync(join(root, 'src/lib/bluesky.ts'), 'utf8');

describe('fetchListMembers (source analysis)', () => {
  it('exists as an exported async function', () => {
    assert.ok(
      src.includes('export async function fetchListMembers'),
      'fetchListMembers must be exported'
    );
  });

  it('uses cursor-based pagination', () => {
    const fnStart = src.indexOf('export async function fetchListMembers');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(fnSrc.includes('cursor'), 'fetchListMembers must use cursor-based pagination');
  });

  it('accepts a maxItems limit to prevent unbounded fetches', () => {
    const fnStart = src.indexOf('export async function fetchListMembers');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(
      fnSrc.includes('maxItems') || fnSrc.includes('MAX_ITEMS') || fnSrc.includes('limit'),
      'fetchListMembers must have a maxItems or limit guard'
    );
  });

  it('accepts an onProgress callback', () => {
    const fnStart = src.indexOf('export async function fetchListMembers');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(
      fnSrc.includes('onProgress') || fnSrc.includes('callback') || fnSrc.includes('(count)'),
      'fetchListMembers should support an onProgress callback'
    );
  });
});

describe('fetchAllFollowers (source analysis)', () => {
  it('exists as an exported async function', () => {
    assert.ok(
      src.includes('export async function fetchAllFollowers'),
      'fetchAllFollowers must be exported'
    );
  });

  it('uses cursor-based pagination', () => {
    const fnStart = src.indexOf('export async function fetchAllFollowers');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(fnSrc.includes('cursor'), 'fetchAllFollowers must use cursor-based pagination');
  });

  it('uses withRetry for the inner API call', () => {
    const fnStart = src.indexOf('export async function fetchAllFollowers');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(fnSrc.includes('withRetry'), 'fetchAllFollowers must wrap API calls with withRetry');
  });
});

describe('fetchPostInteractors (source analysis)', () => {
  it('exists as an exported async function', () => {
    assert.ok(
      src.includes('export async function fetchPostInteractors'),
      'fetchPostInteractors must be exported'
    );
  });

  it('deduplicates results (Set or seen map)', () => {
    const fnStart = src.indexOf('export async function fetchPostInteractors');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(
      fnSrc.includes('Set') || fnSrc.includes('seen'),
      'fetchPostInteractors must deduplicate interactors across types'
    );
  });

  it('supports likes, reposts, quotes types', () => {
    const fnStart = src.indexOf('export async function fetchPostInteractors');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnSrc = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    assert.ok(fnSrc.includes('likes'), 'must handle likes type');
    assert.ok(fnSrc.includes('reposts') || fnSrc.includes('getRepostedBy'), 'must handle reposts type');
    assert.ok(fnSrc.includes('quotes') || fnSrc.includes('getQuotes'), 'must handle quotes type');
  });
});
