import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitStateForTests, checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitStateForTests();
  });

  it("allows requests up to the max within a window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("key-a", 5, 60_000).allowed).toBe(true);
    }
  });

  it("rejects the request once the max is exceeded", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-b", 5, 60_000);
    const result = checkRateLimit("key-b", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-c", 5, 60_000);
    expect(checkRateLimit("key-c", 5, 60_000).allowed).toBe(false);
    expect(checkRateLimit("key-d", 5, 60_000).allowed).toBe(true);
  });

  it("resets the window after it expires", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) checkRateLimit("key-e", 5, 1000);
      expect(checkRateLimit("key-e", 5, 1000).allowed).toBe(false);

      vi.advanceTimersByTime(1001);

      expect(checkRateLimit("key-e", 5, 1000).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
