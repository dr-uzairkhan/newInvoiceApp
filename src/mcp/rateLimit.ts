/**
 * Per-token fixed-window rate limit for the MCP endpoint. In-memory on
 * purpose: production is a single Node process on one droplet
 * (`Docs/implementation_decisions.md` §21), so a shared store would add
 * infrastructure for no gain. Resets on restart, which is fine for a
 * "stop a runaway client" guard rather than a billing meter.
 */
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 120;

type Bucket = { windowStart: number; count: number };
const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > MAX_CALLS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test hook. */
export function resetRateLimits(): void {
  buckets.clear();
}
