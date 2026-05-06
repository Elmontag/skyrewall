import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { parseSession as _parseSession } from '@/lib/session-utils';

export { parseSession, isValidDid, isScopeError } from '@/lib/session-utils';

interface SessionCredentials {
  handle: string;
  password: string;
}

/** Returns the userId from the current request session, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  return _parseSession(session.value)?.userId ?? null;
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
