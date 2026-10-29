import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetRateLimits } from "@/mcp/rateLimit";

describe("mcp rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows 120 calls per token per minute, then refuses with a retry hint, and resets after the window", () => {
    const start = 1_000_000;
    for (let i = 0; i < 120; i += 1) {
      expect(consumeRateLimit("t1", start + i).allowed).toBe(true);
    }
    const refused = consumeRateLimit("t1", start + 1000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);

    // Another token is unaffected.
    expect(consumeRateLimit("t2", start + 1000).allowed).toBe(true);

    // A new window starts clean.
    expect(consumeRateLimit("t1", start + 60_000).allowed).toBe(true);
  });
});
