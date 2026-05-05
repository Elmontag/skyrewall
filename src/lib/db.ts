import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      handle VARCHAR(255) UNIQUE NOT NULL,
      encrypted_password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      target_handle VARCHAR(255) NOT NULL,
      mode VARCHAR(10) NOT NULL CHECK (mode IN ('block', 'mute')),
      include_followers BOOLEAN DEFAULT true,
      sub_type VARCHAR(20) NOT NULL DEFAULT 'follower',
      last_updated TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migrations for existing deployments
  await query(`
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sub_type VARCHAR(20) NOT NULL DEFAULT 'follower'
  `).catch(() => {});

  await query(`
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS block_events (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      target_did TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('block', 'mute')),
      source TEXT NOT NULL CHECK (source IN ('manual', 'subscription', 'reblock', 'interaction', 'imported')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Allow 'imported' source for existing deployments that used a stricter CHECK
  await query(`
    ALTER TABLE block_events DROP CONSTRAINT IF EXISTS block_events_action_check
  `).catch(() => {});
  await query(`
    ALTER TABLE block_events DROP CONSTRAINT IF EXISTS block_events_source_check
  `).catch(() => {});
  await query(`
    ALTER TABLE block_events ADD CONSTRAINT block_events_action_check
      CHECK (action IN ('block', 'mute'))
  `).catch(() => {});
  await query(`
    ALTER TABLE block_events ADD CONSTRAINT block_events_source_check
      CHECK (source IN ('manual', 'subscription', 'reblock', 'interaction', 'imported'))
  `).catch(() => {});

  // Deduplicate existing rows before adding unique constraint (keep oldest per combination)
  await query(`
    DELETE FROM block_events
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_id, target_did, action) id
      FROM block_events
      ORDER BY user_id, target_did, action, created_at ASC
    )
  `).catch(() => {});

  // Add unique constraint so ON CONFLICT DO NOTHING actually prevents duplicates
  await query(`
    ALTER TABLE block_events
    ADD CONSTRAINT block_events_unique UNIQUE (user_id, target_did, action)
  `).catch(() => {});

  await query(`
    CREATE INDEX IF NOT EXISTS block_events_user_date ON block_events(user_id, created_at)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS block_events_user_action ON block_events(user_id, action)
  `);

  // Whitelist: accounts that should never be actioned by subscription sync
  await query(`
    CREATE TABLE IF NOT EXISTS whitelists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      target_did TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, target_did)
    )
  `);

  // Track whether user's existing BlueSky blocks have been imported (cold-start)
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS blocks_imported_at TIMESTAMPTZ
  `).catch(() => {});

  // AT Protocol DID — populated on first app-password login and on OAuth
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS did TEXT
  `).catch(() => {});

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_did_idx ON users(did) WHERE did IS NOT NULL
  `).catch(() => {});

  // Make encrypted_password nullable so OAuth-only users can exist
  await query(`
    ALTER TABLE users ALTER COLUMN encrypted_password DROP NOT NULL
  `).catch(() => {});

  // Encrypted OAuth session data (access + refresh token state), keyed by DID
  await query(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      did TEXT PRIMARY KEY,
      session_data TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Short-lived OAuth state/PKCE verifier storage for the auth flow
  await query(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  // Clean up expired OAuth states (best-effort)
  await query(`DELETE FROM oauth_states WHERE expires_at < NOW()`).catch(() => {});

  // Track when an OAuth session last failed to restore (subscription sync sets/clears this)
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_error_since TIMESTAMPTZ
  `).catch(() => {});

  // Cache for Bluesky list members — populated only by the subscription sync worker.
  // Stateless API endpoints never write here (privacy guarantee).
  await query(`
    CREATE TABLE IF NOT EXISTS list_cache (
      list_uri TEXT PRIMARY KEY,
      member_dids TEXT[] NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
