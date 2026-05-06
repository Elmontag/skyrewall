import { BskyAgent } from '@atproto/api';
import { getSessionUserId } from '@/lib/session';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, createAgentForOAuth } from '@/lib/bluesky';

export interface SessionAgent {
  agent: BskyAgent;
  userId: string;
  handle: string;
}

/**
 * Returns an authenticated Bluesky Agent for the current session.
 *
 * Resolution order:
 * 1. App-password (decrypted from DB) — always tried first, no scope issues.
 * 2. OAuth session — used when no app-password is stored (pure-OAuth users).
 *
 * Returns null when:
 * - No valid session cookie is present (not logged in).
 * - The user has no credentials at all (should not happen in practice).
 * - Both app-password AND OAuth session resolution fail.
 *
 * For stateless requests (credentials in the request body), callers must
 * handle that path separately — this helper only covers stateful sessions.
 */
export async function getSessionAgent(): Promise<SessionAgent | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const rows = await query<{ handle: string; encrypted_password: string | null; did: string | null }>(
    'SELECT handle, encrypted_password, did FROM users WHERE id = $1',
    [userId]
  );
  if (rows.length === 0) return null;

  const { handle, encrypted_password, did } = rows[0];

  // App-password preferred: decrypted locally, always valid as long as the
  // account exists and the password hasn't been rotated.
  if (encrypted_password) {
    try {
      const password = decrypt(encrypted_password);
      const agent = await createAgent(handle, password);
      return { agent, userId, handle };
    } catch {
      // Password may have been rotated or account suspended — fall through.
    }
  }

  // OAuth fallback for pure-OAuth users (encrypted_password is NULL).
  if (did) {
    try {
      const agent = await createAgentForOAuth(did) as unknown as BskyAgent;
      return { agent, userId, handle };
    } catch {
      // OAuth session expired or revoked.
    }
  }

  return null;
}
