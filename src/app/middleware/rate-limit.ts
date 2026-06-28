// In-memory token-bucket rate limiter, keyed by bearer token (or "anonymous"
// when auth is disabled). Single-process only — for multi-instance deploys
// swap to Redis or a shared store. Process restart resets all buckets.
//
// Token bucket: each key starts with `capacity` tokens. Each request consumes
// 1 token. Tokens refill at `capacity / windowMs` per ms. When a bucket hits
// 0, requests are 429'd until enough refill.

export type RateLimiterOptions = {
  capacity: number; // bucket size (also burst allowance)
  windowMs: number; // time to fully refill from empty
  now?: () => number; // injection point for tests
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number; // 0 when allowed, > 0 when denied
};

export type RateLimiter = {
  check(key: string): RateLimitDecision;
};

type BucketState = {
  tokens: number;
  lastRefillMs: number;
};

export function createTokenBucketLimiter(
  options: RateLimiterOptions,
): RateLimiter {
  if (!Number.isSafeInteger(options.capacity) || options.capacity < 1) {
    throw new Error("rate-limit capacity must be a positive integer");
  }
  if (options.windowMs <= 0 || !Number.isFinite(options.windowMs)) {
    throw new Error("rate-limit windowMs must be a positive finite number");
  }

  const buckets = new Map<string, BucketState>();
  const now = options.now ?? (() => Date.now());
  const refillRatePerMs = options.capacity / options.windowMs;

  return {
    check(key: string): RateLimitDecision {
      const t = now();
      const existing = buckets.get(key);
      const bucket = existing ?? {
        tokens: options.capacity,
        lastRefillMs: t,
      };

      const elapsed = Math.max(0, t - bucket.lastRefillMs);
      const refilled = Math.min(
        options.capacity,
        bucket.tokens + elapsed * refillRatePerMs,
      );

      if (refilled >= 1) {
        const next: BucketState = {
          tokens: refilled - 1,
          lastRefillMs: t,
        };
        buckets.set(key, next);
        return {
          allowed: true,
          remaining: Math.floor(next.tokens),
          retryAfterMs: 0,
        };
      }

      // Not enough tokens to allow one. Persist the refill progress and
      // compute when the next token will be available.
      const next: BucketState = {
        tokens: refilled,
        lastRefillMs: t,
      };
      buckets.set(key, next);
      const tokensNeeded = 1 - refilled;
      const retryAfterMs = Math.ceil(tokensNeeded / refillRatePerMs);
      return { allowed: false, remaining: 0, retryAfterMs };
    },
  };
}

// Reads per-minute rate from env. Returns null when unset (= no rate limiting).
export function loadRateLimitFromEnv(
  env: NodeJS.ProcessEnv,
): RateLimiterOptions | null {
  const raw = env.RATE_LIMIT_PER_MINUTE;
  if (!raw) {
    return null;
  }
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `RATE_LIMIT_PER_MINUTE must be a positive integer, got "${raw}"`,
    );
  }
  const capacity = Number(normalized);
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error(
      `RATE_LIMIT_PER_MINUTE must be a positive integer, got "${raw}"`,
    );
  }
  return {
    capacity,
    windowMs: 60_000,
  };
}
