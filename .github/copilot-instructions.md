# SkyreWall – Copilot Instructions

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # ESLint via next lint
npx next start    # Start production server (after build)
docker compose up -d  # Run full stack (app + postgres) in Docker
```

There is no test suite.

## Architecture

SkyreWall is a **Next.js 15 (App Router)** BlueSky moderation tool that lets users block or mute accounts and their followers — either as a one-off action or on a recurring schedule via subscriptions.

**Two operation modes:**
- **Stateless** – No registration required. BlueSky credentials are used once per request and never persisted.
- **Stateful** – Users register to unlock Subscriptions (automated recurring block/mute rules) and block-event history. Credentials are stored AES-256-GCM encrypted in PostgreSQL.

**Key layers:**

| Layer | Location | Purpose |
|---|---|---|
| API routes | `src/app/api/` | All server endpoints (Next.js route handlers) |
| React components | `src/components/` | Client-side UI; no routing logic |
| Library | `src/lib/` | All server-side utilities (DB, encryption, BlueSky, sync, rate-limiting) |
| Types | `src/types/index.ts` | Shared TypeScript interfaces |
| i18n | `src/i18n/` | English (`en.ts`) and German (`de.ts`) translations |

**Startup bootstrap** (`src/instrumentation.ts`): On Node.js runtime, calls `initDb()` (creates/migrates DB tables) and `startSyncWorker()` (starts the background subscription sync timer).

**Background sync** (`src/lib/sync-worker.ts`): Runs every `SYNC_INTERVAL_MINUTES` (default 60). For each subscription, fetches target DIDs via the AT Protocol or ClearSky API, filters out whitelisted and already-actioned DIDs (DB-only check, no extra API calls), then calls the BlueSky API to block/mute new DIDs and logs them in `block_events`.

**BlueSky integration** (`src/lib/bluesky.ts`): Wraps `@atproto/api`. All outbound calls use `withRetry()` which handles 429/503 with exponential backoff and Retry-After header.

**ClearSky API** (`https://public.api.clearsky.services`): Used for `reblock` subscriptions to fetch accounts that have blocked a given user.

## Database

Schema is defined and migrated inline in `src/lib/db.ts → initDb()`. All schema migrations are additive (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) with `.catch(() => {})` so they are safe to re-run against existing deployments. Never drop columns or rewrite the migration history — just append new `ALTER` statements.

Tables: `users`, `subscriptions`, `block_events`, `whitelists`.

`block_events` has a unique constraint on `(user_id, target_did, action)` — inserts use `ON CONFLICT DO NOTHING`.

## API Route Conventions

Every mutating route should follow this pattern:

```ts
// 1. Reject cross-origin requests (CSRF protection)
const originRejection = rejectCrossOrigin(req);
if (originRejection) return originRejection;

// 2. Verify session
const userId = await getSessionUserId();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// 3. Rate-limit by userId (or IP for unauthenticated routes)
const limited = checkApiRateLimit(req, { scope: 'example', identity: userId, limit: 30, windowMs: 60 * 60 * 1000 });
if (limited) return limited;
```

All helpers are in `src/lib/request-security.ts` and `src/lib/session.ts`.

Always use `sanitizeError(err)` (from `src/lib/request-security.ts`) when logging errors — it strips handle/password values to prevent credential leaks in logs.

Always call `logBlockEvents()` (from `src/lib/block-events.ts`) after any block or mute action, passing the correct `source` (`'manual'`, `'subscription'`, `'reblock'`, `'interaction'`, or `'imported'`).

## Security Notes

- **Encryption**: `ENCRYPTION_KEY` env var is required for both AES-256-GCM credential encryption and HMAC-SHA256 session cookie signing. Changing this key invalidates all stored credentials and sessions.
- **Sessions**: HMAC-signed cookies (`v1:<payload>.<sig>`), 7-day expiry enforced server-side via `iat` claim. Cookie is `HttpOnly`, `SameSite=Strict`, `Secure` in production.
- **Rate limiter** (`src/lib/rate-limit.ts`): In-memory sliding window — suitable for single-instance Docker deployments only. Must be replaced with a Redis-backed store for multi-instance deployments.
- **DID validation**: Always validate AT Protocol DIDs with `isValidDid()` from `src/lib/session.ts` before using them in queries or API calls.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 32-byte hex string (generate: `openssl rand -hex 32`) |
| `POSTGRES_USER` | Yes (Docker) | DB username |
| `POSTGRES_PASSWORD` | Yes (Docker) | DB password |
| `SYNC_INTERVAL_MINUTES` | No | Background sync interval, default `60` |

## Path Alias

`@/` maps to `src/` (configured in `tsconfig.json`).
