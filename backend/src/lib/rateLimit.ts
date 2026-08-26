/**
 * In-memory fixed-window rate limiter — deliberately simple, no Redis/queue
 * dependency, per the project's "no unnecessary infrastructure" mandate.
 * Correct for a single-process deployment; a multi-instance deployment would
 * need a shared store (Redis) since each process would count independently
 * — documented as a known limitation, not silently glossed over.
 *
 * A module-level Map persists for the process lifetime; a periodic sweep
 * evicts expired entries so an attacker sending many distinct keys (e.g.
 * many different emails) can't grow it unboundedly forever, though a
 * sustained flood within one sweep interval still grows it temporarily —
 * acceptable for this project's scope, not a guarantee against a
 * determined distributed attacker.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

const SWEEP_INTERVAL_MS = 60_000;
let sweepTimer: ReturnType<typeof setInterval> | undefined;

function ensureSweepRunning(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Never let this background timer keep the process alive on its own
  // (relevant for tests/serverless — a real request always keeps it busy).
  sweepTimer.unref?.();
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * Fixed-window: `key`'s count resets to 0 every `windowMs`, allowing up to
 * `maxRequests` within a window. Simpler than a sliding window (no need to
 * track individual timestamps) — the trade-off (a burst spanning a window
 * boundary can briefly allow up to ~2x maxRequests) is acceptable for this
 * project's abuse-prevention goals, not a hard guarantee.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  ensureSweepRunning();

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Test-only: clears all rate-limit state between test cases. */
export function _resetRateLimitStateForTests(): void {
  buckets.clear();
}
