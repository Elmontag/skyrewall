# SkyreWall

A moderation tool for Bluesky that lets you block or mute accounts and their followers — either as a one-off action or on a recurring schedule via subscriptions.

## Features

- **Block / mute followers** of any account, a Bluesky list, or accounts that blocked you (`reblock`)
- **Post interactions** — block/mute everyone who liked, reposted, or quoted a specific post
- **Subscriptions** — recurring scheduled syncs so new followers are caught automatically
- **Protect mutuals / followings** — optionally skip accounts you follow or who follow you back
- **Add-to-list** — add matched accounts to a Bluesky moderation list instead of blocking
- **Whitelist** — exclude specific DIDs from any action
- **Stateless mode** — no registration needed; credentials are used once per request and never stored
- **Stateful mode** — register to unlock subscriptions, block-event history, and OAuth login

---

## Quick Start (Docker)

```bash
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env          # fill in all values
docker compose up -d
```

The app is available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 32-byte hex string — generate with `openssl rand -hex 32` |
| `POSTGRES_USER` | Yes (Docker) | DB username |
| `POSTGRES_PASSWORD` | Yes (Docker) | DB password |
| `POSTGRES_DB` | Yes (Docker) | DB name |
| `NEXT_PUBLIC_APP_URL` | OAuth only | Public HTTPS URL, e.g. `https://skyrewall.example.com` |
| `SYNC_INTERVAL_MINUTES` | No | Background sync interval, default `60` |

> **Note:** Changing `ENCRYPTION_KEY` invalidates all stored credentials and active sessions.

---

## Development

```bash
npm install
npm run dev       # Next.js dev server (http://localhost:3000)
npm run build     # Production build
npm run lint      # ESLint via next lint
npx next start    # Start production server (after build)
```

Requires a running PostgreSQL instance. Schema is created automatically on first start.

---

## Logging & Debug Information

SkyreWall uses a lightweight structured logger (`src/lib/logger.ts`). Every log line follows this format:

```
<ISO-timestamp> [<context>] <event> <JSON-meta>
```

Example:
```
2026-05-07T21:52:00.000Z [sync] sub-start {"subId":42,"handle":"alice.bsky.social","target":"target.bsky.social","mode":"block","subType":"followers","followersOnly":true,"protectMutuals":true}
2026-05-07T21:52:05.000Z [sync] sub-complete {"subId":42,"handle":"alice.bsky.social","newBlocked":3,"total":147,"listUri":"at://...","followersOnly":true}
```

### Log contexts

| Context | Emitted by | Key events |
|---|---|---|
| `sync` | `sync-worker.ts` | `agent-resolved`, `sub-start`, `sub-complete`, `sub-skip`, `sub-error`, `sync-done`, `auto-paused` |
| `auth` | login / OAuth routes | `login-success`, `login-error`, `oauth-start`, `oauth-callback-success`, `oauth-callback-error` |
| `block-stream` | `block-stream/route.ts` | `blocked`, `error` |
| `mute-stream` | `mute-stream/route.ts` | `muted`, `error` |

### Key `[sync]` fields

| Field | Appears when | Meaning |
|---|---|---|
| `pds` | always | Hostname of the PDS used for this subscription |
| `authMethod` | always | `oauth` or `app-password` |
| `subType` | always | `followers`, `list`, `reblock`, `postinteraction` |
| `followersOnly` | `include_followers` subscriptions | Whether target account itself is excluded |
| `excludeList` | exclude list configured | Target DIDs are filtered against this list |
| `protectMutuals` | option enabled | Mutual follows are skipped |
| `protectFollowings` | option enabled | Accounts you follow are skipped |
| `listUri` | `subType=list` | AT URI of the source list |
| `addToList` | add-to-list configured | Matched DIDs are added to a list instead of blocked |

### Reading logs (Docker)

```bash
# All structured [sync] log entries
docker compose logs app 2>&1 | grep "\[sync\]"

# Multiple contexts at once
docker compose logs app 2>&1 | grep -E "\[(sync|auth)\]"

# Last 24 hours only
docker compose logs app --since 24h

# Follow live output
docker compose logs app -f

# Last N lines
docker compose logs app --tail=200
```

### Log rotation

Log rotation is pre-configured in `docker-compose.yml`:

```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"   # rotate when a file exceeds 50 MB
    max-file: "5"     # keep at most 5 rotated files (max 250 MB total)
```

Docker rotates automatically — no cron jobs needed. To clear the current log buffer immediately:

```bash
sudo truncate -s 0 $(docker inspect --format='{{.LogPath}}' skyrewall-app-1)
```

> `debug`-level messages are suppressed in production (`NODE_ENV=production`). Set `NODE_ENV=development` to see them.

---

## Tests

Run the test suite with:

```bash
npm run test
```

Uses Node.js built-in `node:test` with `tsx` (no external test framework). Tests cannot import Next.js or database modules directly; files with those dependencies are covered via static source analysis (`readFileSync` pattern).

### Test files

| File | What it covers |
|---|---|
| `tests/bluesky-retry.test.ts` | `withRetry()` — immediate throw for non-retryable errors; retry on HTTP 429/503 with `Retry-After` header and exponential backoff; retry on transient network errors (`UND_ERR_SOCKET`, `ECONNRESET`, `ETIMEDOUT`, etc.) up to 3 levels of `err.cause` |
| `tests/bluesky-fetch.test.ts` | All fetch helpers in `bluesky.ts` (`fetchAllFollowers`, `getListMembersCached`, `fetchBlockedByFromClearSky`, `fetchPostInteractors`) — call patterns and retry wiring |
| `tests/bluesky-actions.test.ts` | Block/mute/unblock/unmute action wrappers — retry wiring, input validation |
| `tests/sync-routing.test.ts` | `sync-worker.ts` structural invariants — `sub_type` → fetch function mapping; error routing (scope error → re-auth flag, unavailable → pause, others → auto-pause threshold); OAuth-first agent resolution; per-subscription `Promise.race` timeout; `processRow` extraction |
| `tests/session-utils.test.ts` | `isValidDid()`, `parseSession()`, session cookie format, HMAC signature verification |
| `tests/encryption.test.ts` | AES-256-GCM encrypt/decrypt round-trip, wrong-key rejection, tamper detection |
| `tests/request-security.test.ts` | `sanitizeError()` — strips handle/password from error strings; `rejectCrossOrigin()` — CSRF origin checks |
| `tests/pds-security.test.ts` | PDS URL allow-list validation, rejection of non-HTTPS and private/loopback addresses |
| `tests/oauth-regression.test.ts` | OAuth error-handling regressions — scope error detection via `isScopeError()`, `oauth_error_since` flag set on failure |

### What is not tested

- Next.js route handlers (require the full Next.js runtime)
- Database layer (`src/lib/db.ts`) — requires a live PostgreSQL connection
- Background sync execution end-to-end — covered structurally by `sync-routing.test.ts`

---

## Security Notes

- **No sensitive data in logs** — `sanitizeError()` strips handles and passwords from all error messages before logging
- **Encryption** — stored credentials are AES-256-GCM encrypted with scrypt key derivation
- **Sessions** — HMAC-SHA256 signed cookies, 7-day expiry enforced server-side, `HttpOnly` + `SameSite=Strict` + `Secure` in production
- **Rate limiting** — in-memory sliding window per route; suitable for single-instance deployments only (replace with Redis for multi-instance)
- **CSRF protection** — all mutating API routes reject cross-origin requests via `rejectCrossOrigin()`
- **DID validation** — all AT Protocol DIDs are validated with `isValidDid()` before use
