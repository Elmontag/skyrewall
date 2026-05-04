/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-instance deployments (Docker Compose).
 * For multi-instance setups replace with a Redis-backed store.
 */

interface Window {
  count: number;
  resetAt: number; // Unix ms
}

const store = new Map<string, Window>();

// Periodically purge expired entries to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}, 60_000);

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (only set when blocked). */
  retryAfter?: number;
}

/**
 * @param key       Unique key, e.g. `"login:<ip>"`
 * @param limit     Max requests allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let win = store.get(key);

  if (!win || win.resetAt <= now) {
    win = { count: 1, resetAt: now + windowMs };
    store.set(key, win);
    return { allowed: true };
  }

  win.count++;
  if (win.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((win.resetAt - now) / 1000),
    };
  }

  return { allowed: true };
}
