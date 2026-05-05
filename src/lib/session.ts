import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { decrypt, verifySession } from '@/lib/encryption';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionCredentials {
  handle: string;
  password: string;
}

/**
 * Verifies the HMAC signature and checks the server-side `iat` expiry.
 * Returns the parsed `userId`, or null if the session is invalid or expired.
 */
export function parseSession(token: string): { userId: string } | null {
  const payload = verifySession(token);
  if (!payload) return null;
  try {
    const data = JSON.parse(payload);
    if (!data.userId) return null;
    // Enforce server-side expiry when iat is present (new sessions always have it)
    if (typeof data.iat === 'number') {
      const ageSecs = Math.floor(Date.now() / 1000) - data.iat;
      if (ageSecs > SESSION_MAX_AGE_SECONDS) return null;
    }
    return { userId: data.userId };
  } catch {
    return null;
  }
}

/** Returns the userId from the current request session, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  return parseSession(session.value)?.userId ?? null;
}

/** Returns decrypted credentials from the current session, or null if not logged in. */
export async function getSessionCredentials(): Promise<SessionCredentials | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
    const rows = await query<{ handle: string; encrypted_password: string | null }>(
      'SELECT handle, encrypted_password FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length === 0) return null;
    if (!rows[0].encrypted_password) return null;
    return { handle: rows[0].handle, password: decrypt(rows[0].encrypted_password) };
  } catch {
    return null;
  }
}

/** Basic AT Protocol DID validation (did:plc:… or did:web:…). */
export function isValidDid(did: string): boolean {
  return typeof did === 'string' && /^did:[a-z]+:[a-zA-Z0-9._:%-]{1,512}$/.test(did);
}
