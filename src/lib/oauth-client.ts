import { NodeOAuthClient } from '@atproto/oauth-client-node';
import type { NodeSavedState, NodeSavedSession } from '@atproto/oauth-client-node';
import { Agent } from '@atproto/api';
import { query } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';

/** Base public URL of this application (e.g. https://skyrewall.example.com) */
function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error('NEXT_PUBLIC_APP_URL environment variable is not set');
  return url.replace(/\/$/, '');
}

/** PostgreSQL-backed StateStore for short-lived OAuth state/PKCE data */
const pgStateStore = {
  async set(key: string, state: NodeSavedState): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await query(
      `INSERT INTO oauth_states (key, value, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
      [key, JSON.stringify(state), expiresAt.toISOString()]
    );
  },
  async get(key: string): Promise<NodeSavedState | undefined> {
    const rows = await query<{ value: string; expires_at: string }>(
      'SELECT value, expires_at FROM oauth_states WHERE key = $1',
      [key]
    );
    if (rows.length === 0) return undefined;
    if (new Date(rows[0].expires_at) < new Date()) {
      await query('DELETE FROM oauth_states WHERE key = $1', [key]).catch(() => {});
      return undefined;
    }
    return JSON.parse(rows[0].value) as NodeSavedState;
  },
  async del(key: string): Promise<void> {
    await query('DELETE FROM oauth_states WHERE key = $1', [key]).catch(() => {});
  },
};

/** PostgreSQL-backed SessionStore for encrypted OAuth token state */
const pgSessionStore = {
  async set(sub: string, session: NodeSavedSession): Promise<void> {
    const encrypted = encrypt(JSON.stringify(session));
    await query(
      `INSERT INTO oauth_sessions (did, session_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (did) DO UPDATE SET session_data = $2, updated_at = NOW()`,
      [sub, encrypted]
    );
  },
  async get(sub: string): Promise<NodeSavedSession | undefined> {
    const rows = await query<{ session_data: string }>(
      'SELECT session_data FROM oauth_sessions WHERE did = $1',
      [sub]
    );
    if (rows.length === 0) return undefined;
    try {
      return JSON.parse(decrypt(rows[0].session_data)) as NodeSavedSession;
    } catch {
      return undefined;
    }
  },
  async del(sub: string): Promise<void> {
    await query('DELETE FROM oauth_sessions WHERE did = $1', [sub]).catch(() => {});
  },
};

let _client: NodeOAuthClient | null = null;

export function getOAuthClient(): NodeOAuthClient {
  if (_client) return _client;

  const appUrl = getAppUrl();
  const clientId =
    appUrl.startsWith('http://localhost') || appUrl.startsWith('http://127.')
      ? `http://localhost`
      : `${appUrl}/client-metadata.json`;

  _client = new NodeOAuthClient({
    clientMetadata: {
      client_id: clientId,
      client_name: 'SkyreWall',
      client_uri: appUrl,
      redirect_uris: [`${appUrl}/api/auth/oauth/callback`],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
    stateStore: pgStateStore,
    sessionStore: pgSessionStore,
  });

  return _client;
}

/**
 * Restore an OAuth session for a DID and return a ready-to-use Agent.
 * Automatically refreshes the access token if needed.
 * Throws if the session is not found or cannot be restored.
 */
export async function createOAuthAgent(did: string): Promise<Agent> {
  const client = getOAuthClient();
  const oauthSession = await client.restore(did);
  return new Agent(oauthSession);
}
