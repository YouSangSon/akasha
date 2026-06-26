import { describe, expect, it, vi } from "vitest";
import {
  loadBearerTokens,
  matchBearer,
  matchBearerFromRequest,
  checkBearer,
} from "../../src/app/middleware/bearer-auth.js";
import type { IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// vi.mock must be hoisted to the top of the module (Vitest limitation with ESM).
// We intercept the SUT's import of node:crypto so we can spy on timingSafeEqual
// while still passing through to the real implementation (timing + correctness).
// ---------------------------------------------------------------------------

const timingSafeEqualSpy = vi.hoisted(() => vi.fn());

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    timingSafeEqual: (...args: Parameters<typeof actual.timingSafeEqual>) => {
      timingSafeEqualSpy(...args);
      return actual.timingSafeEqual(...args);
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(authHeader?: string): IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as IncomingMessage;
}

const TOKENS = [
  { token: "alpha-secret", organizationId: "dev-team" },
  { token: "beta-secret", organizationId: "finance-team" },
  { token: "legacy-token" }, // no binding
];

// ---------------------------------------------------------------------------
// matchBearer — core auth logic
// ---------------------------------------------------------------------------

describe("matchBearer", () => {
  describe("valid token: authorized and returns matched entry", () => {
    it("returns the matched BearerToken when the header is valid", () => {
      // Arrange
      const header = "Bearer alpha-secret";

      // Act
      const result = matchBearer(header, TOKENS);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.token).toBe("alpha-secret");
      expect(result!.organizationId).toBe("dev-team");
    });

    it("returns the matched entry for a token without an org binding", () => {
      // Arrange
      const header = "Bearer legacy-token";

      // Act
      const result = matchBearer(header, TOKENS);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.token).toBe("legacy-token");
      expect(result!.organizationId).toBeUndefined();
    });
  });

  describe("missing or malformed Authorization header: rejected", () => {
    it("returns null when authHeader is undefined", () => {
      // Arrange & Act
      const result = matchBearer(undefined, TOKENS);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when authHeader is an empty string", () => {
      // Arrange & Act
      const result = matchBearer("", TOKENS);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when authHeader is missing the Bearer prefix", () => {
      // Arrange & Act
      const result = matchBearer("alpha-secret", TOKENS);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when the token value after 'Bearer ' is empty", () => {
      // Arrange & Act
      const result = matchBearer("Bearer ", TOKENS);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when the token does not match any configured entry", () => {
      // Arrange & Act
      const result = matchBearer("Bearer unknown-token", TOKENS);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null when the token list is empty", () => {
      // Arrange & Act
      const result = matchBearer("Bearer alpha-secret", []);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("timing-safe comparison: timingSafeEqual is invoked", () => {
    it("calls timingSafeEqual (not string equality) for a same-length matching token", () => {
      // Arrange — reset the hoisted spy so prior test calls don't bleed in.
      timingSafeEqualSpy.mockClear();

      // Act
      const result = matchBearer("Bearer alpha-secret", TOKENS);

      // Assert — the match must succeed (spy passes through to real impl)
      expect(result).not.toBeNull();
      // The spy must have been called at least once — proving the
      // implementation does not fall back to a plain string comparison.
      expect(timingSafeEqualSpy).toHaveBeenCalled();
    });

    it("does not throw when header length differs from configured token length (length guard prevents timingSafeEqual buffer mismatch)", () => {
      // Arrange — different-length input; the SUT must guard against calling
      // timingSafeEqual with mismatched buffers (which would throw).
      const shortHeader = "Bearer x";

      // Act & Assert — must not throw
      expect(() => matchBearer(shortHeader, TOKENS)).not.toThrow();
      expect(matchBearer(shortHeader, TOKENS)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// token:org binding parsed correctly
// ---------------------------------------------------------------------------

describe("loadBearerTokens", () => {
  it("returns empty array when MEMORY_API_TOKENS is not set", () => {
    // Arrange & Act
    const tokens = loadBearerTokens({});

    // Assert
    expect(tokens).toEqual([]);
  });

  it("parses a plain token with no org binding", () => {
    // Arrange & Act
    const tokens = loadBearerTokens({ MEMORY_API_TOKENS: "my-plain-token" });

    // Assert
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe("my-plain-token");
    expect(tokens[0].organizationId).toBeUndefined();
  });

  it("parses a token:org entry and extracts both parts", () => {
    // Arrange & Act
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: "secret-token:dev-team",
    });

    // Assert
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe("secret-token");
    expect(tokens[0].organizationId).toBe("dev-team");
  });

  it("parses multiple comma-separated entries", () => {
    // Arrange & Act
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: "alpha:dev-team,beta:finance-team,legacy-token",
    });

    // Assert
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ token: "alpha", organizationId: "dev-team" });
    expect(tokens[1]).toEqual({
      token: "beta",
      organizationId: "finance-team",
    });
    expect(tokens[2]).toEqual({ token: "legacy-token" });
  });

  it("rejects a token binding with an empty organization id", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: "my-token:" }),
    ).toThrow(/Invalid MEMORY_API_TOKENS entry: organization id is empty/i);
  });

  it("rejects a token binding with an empty token", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: ":dev-team" }),
    ).toThrow(/Invalid MEMORY_API_TOKENS entry: token is empty/i);
  });

  it("rejects entries with multiple colons", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: "alpha:dev:team" }),
    ).toThrow(
      /Invalid MEMORY_API_TOKENS entry: tokens may contain at most one colon/i,
    );
  });

  it("ignores empty comma-separated entries while still parsing valid tokens", () => {
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: "alpha-token:dev-team,  , legacy-token",
    });

    expect(tokens).toEqual([
      { token: "alpha-token", organizationId: "dev-team" },
      { token: "legacy-token" },
    ]);
  });

  it("ignores whitespace-only entries", () => {
    // Arrange & Act
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: "good-token,  , another-token",
    });

    // Assert
    expect(tokens).toHaveLength(2);
    expect(tokens.map((t) => t.token)).toEqual(["good-token", "another-token"]);
  });
});

// ---------------------------------------------------------------------------
// matchBearerFromRequest — reads authorization header from IncomingMessage
// ---------------------------------------------------------------------------

describe("matchBearerFromRequest", () => {
  it("returns the matched token when the request carries a valid Authorization header", () => {
    // Arrange
    const req = makeReq("Bearer alpha-secret");

    // Act
    const result = matchBearerFromRequest(req, TOKENS);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.organizationId).toBe("dev-team");
  });

  it("returns null when the request has no Authorization header", () => {
    // Arrange
    const req = makeReq();

    // Act
    const result = matchBearerFromRequest(req, TOKENS);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkBearer — backward-compat boolean wrapper
// ---------------------------------------------------------------------------

describe("checkBearer", () => {
  it("returns true for a valid bearer token", () => {
    expect(checkBearer("Bearer alpha-secret", TOKENS)).toBe(true);
  });

  it("returns false for an invalid bearer token", () => {
    expect(checkBearer("Bearer wrong", TOKENS)).toBe(false);
  });

  it("returns false when authHeader is undefined", () => {
    expect(checkBearer(undefined, TOKENS)).toBe(false);
  });
});
