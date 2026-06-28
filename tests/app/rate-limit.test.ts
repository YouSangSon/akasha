import { describe, expect, it } from "vitest";
import {
  createTokenBucketLimiter,
  loadRateLimitFromEnv,
} from "../../src/app/middleware/rate-limit.js";

// Tests use the `now` injection point built into the rate limiter to control
// time deterministically without real timers or Date.now().
//
// Configuration: capacity=3, windowMs=60_000
//   refillRate = 3 / 60_000 = 0.00005 tokens/ms
//   msPerToken = 60_000 / 3 = 20_000 ms

const CAPACITY = 3;
const WINDOW_MS = 60_000;
const MS_PER_TOKEN = WINDOW_MS / CAPACITY; // 20_000 ms

describe("createTokenBucketLimiter", () => {
  it("throws on zero, negative, or fractional capacity", () => {
    expect(() =>
      createTokenBucketLimiter({ capacity: 0, windowMs: 60_000 }),
    ).toThrow("capacity");
    expect(() =>
      createTokenBucketLimiter({ capacity: -1, windowMs: 60_000 }),
    ).toThrow("capacity");
    expect(() =>
      createTokenBucketLimiter({ capacity: 0.5, windowMs: 60_000 }),
    ).toThrow("capacity");
    expect(() =>
      createTokenBucketLimiter({ capacity: 1.5, windowMs: 60_000 }),
    ).toThrow("capacity");
  });

  it("throws on zero or negative windowMs", () => {
    expect(() =>
      createTokenBucketLimiter({ capacity: 3, windowMs: 0 }),
    ).toThrow("windowMs");
    expect(() =>
      createTokenBucketLimiter({ capacity: 3, windowMs: -1_000 }),
    ).toThrow("windowMs");
  });

  describe("under-limit: first N requests are allowed", () => {
    it("allows the first `capacity` requests without blocking", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });

      // Act & Assert — all CAPACITY requests are allowed
      for (let i = 0; i < CAPACITY; i++) {
        const decision = limiter.check("tokenA");
        expect(decision.allowed).toBe(true);
        expect(decision.retryAfterMs).toBe(0);
      }
    });

    it("remaining decrements correctly with each allowed request", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });

      // Act
      const first = limiter.check("tokenA");
      const second = limiter.check("tokenA");
      const third = limiter.check("tokenA");

      // Assert — remaining counts down: 2 → 1 → 0
      expect(first.remaining).toBe(2);
      expect(second.remaining).toBe(1);
      expect(third.remaining).toBe(0);
    });
  });

  describe("over-limit: the (capacity+1)th request is blocked", () => {
    it("blocks when the bucket is empty and returns allowed:false", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });
      for (let i = 0; i < CAPACITY; i++) {
        limiter.check("tokenA");
      }

      // Act
      const denied = limiter.check("tokenA");

      // Assert
      expect(denied.allowed).toBe(false);
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfterMs).toBeGreaterThan(0);
    });

    it("retryAfterMs is the exact time needed to accumulate one token", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });
      for (let i = 0; i < CAPACITY; i++) {
        limiter.check("tokenA");
      }

      // Act — bucket is empty at t=0
      const denied = limiter.check("tokenA");

      // Assert — must wait exactly one token's worth of ms
      expect(denied.retryAfterMs).toBe(MS_PER_TOKEN);
    });
  });

  describe("window reset: bucket refills after enough time passes", () => {
    it("allows a request after waiting retryAfterMs milliseconds", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });
      for (let i = 0; i < CAPACITY; i++) {
        limiter.check("tokenA");
      }
      const denied = limiter.check("tokenA");
      expect(denied.allowed).toBe(false);

      // Act — advance time by exactly one token's worth
      time += denied.retryAfterMs;
      const after = limiter.check("tokenA");

      // Assert
      expect(after.allowed).toBe(true);
      expect(after.retryAfterMs).toBe(0);
    });

    it("refills the entire bucket after one full window", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });
      for (let i = 0; i < CAPACITY; i++) {
        limiter.check("tokenA");
      }

      // Act — advance time by a full window
      time += WINDOW_MS;

      // Assert — all CAPACITY requests should be allowed again
      for (let i = 0; i < CAPACITY; i++) {
        const decision = limiter.check("tokenA");
        expect(decision.allowed).toBe(true);
      }
    });
  });

  describe("per-token isolation: keys are independent", () => {
    it("tokenA's consumption does not reduce tokenB's bucket", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });

      // Act — drain tokenA completely
      for (let i = 0; i < CAPACITY; i++) {
        limiter.check("tokenA");
      }
      const aDenied = limiter.check("tokenA");

      // Assert — tokenA is blocked
      expect(aDenied.allowed).toBe(false);

      // Assert — tokenB still has a full bucket
      for (let i = 0; i < CAPACITY; i++) {
        const bDecision = limiter.check("tokenB");
        expect(bDecision.allowed).toBe(true);
      }
    });

    it("each key starts its own independent bucket", () => {
      // Arrange
      let time = 0;
      const limiter = createTokenBucketLimiter({
        capacity: CAPACITY,
        windowMs: WINDOW_MS,
        now: () => time,
      });

      // Act
      const a1 = limiter.check("alpha");
      const b1 = limiter.check("beta");

      // Assert — both start at full capacity and decrease independently
      expect(a1.remaining).toBe(2);
      expect(b1.remaining).toBe(2);

      const a2 = limiter.check("alpha");
      // beta's count should not have changed due to alpha's second call
      expect(a2.remaining).toBe(1);
      const b2 = limiter.check("beta");
      expect(b2.remaining).toBe(1);
    });
  });
});

describe("loadRateLimitFromEnv", () => {
  it("returns null when RATE_LIMIT_PER_MINUTE is not set", () => {
    // Arrange & Act
    const result = loadRateLimitFromEnv({});

    // Assert
    expect(result).toBeNull();
  });

  it("parses a valid positive integer into capacity + 60s window", () => {
    // Arrange & Act
    const result = loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "100" });

    // Assert
    expect(result).not.toBeNull();
    expect(result!.capacity).toBe(100);
    expect(result!.windowMs).toBe(60_000);
  });

  it("throws on a non-numeric value", () => {
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "abc" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
  });

  it("throws on zero", () => {
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "0" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
  });

  it("throws on a negative value", () => {
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "-5" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
  });

  it("throws on fractional and non-decimal numeric forms", () => {
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "0.5" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "100.5" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "100abc" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "1e2" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
    expect(() =>
      loadRateLimitFromEnv({ RATE_LIMIT_PER_MINUTE: "0x64" }),
    ).toThrow("RATE_LIMIT_PER_MINUTE");
  });
});
