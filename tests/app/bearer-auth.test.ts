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
    it("checks every configured token before returning a first-entry match", () => {
      // Arrange — reset the hoisted spy so prior test calls don't bleed in.
      timingSafeEqualSpy.mockClear();

      // Act
      const result = matchBearer("Bearer alpha-secret", TOKENS);

      // Assert — the match must succeed (spy passes through to real impl)
      expect(result).not.toBeNull();
      // One fixed-width digest comparison per configured token keeps match
      // position from deciding how early the loop exits.
      expect(timingSafeEqualSpy).toHaveBeenCalledTimes(TOKENS.length);
    });

    it("compares different-length input without skipping configured tokens", () => {
      // Arrange — different-length input; digest comparison keeps
      // timingSafeEqual buffers fixed-width.
      timingSafeEqualSpy.mockClear();
      const shortHeader = "Bearer x";

      // Act
      const result = matchBearer(shortHeader, TOKENS);

      // Assert
      expect(result).toBeNull();
      expect(timingSafeEqualSpy).toHaveBeenCalledTimes(TOKENS.length);
    });

    it("checks every configured token before returning a later match", () => {
      timingSafeEqualSpy.mockClear();

      const result = matchBearer("Bearer legacy-token", TOKENS);

      expect(result).toEqual({ token: "legacy-token" });
      expect(timingSafeEqualSpy).toHaveBeenCalledTimes(TOKENS.length);
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

  it("returns empty array when MEMORY_API_TOKENS is empty", () => {
    const tokens = loadBearerTokens({ MEMORY_API_TOKENS: "" });

    expect(tokens).toEqual([]);
  });

  it("rejects whitespace-only MEMORY_API_TOKENS values", () => {
    expect(() => loadBearerTokens({ MEMORY_API_TOKENS: " \n\t " })).toThrow(
      /Invalid MEMORY_API_TOKENS entry: entries must not be blank/i,
    );
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

  it("trims valid comma-separated entries", () => {
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: " alpha:dev-team , beta:finance-team , legacy-token ",
    });

    expect(tokens).toEqual([
      { token: "alpha", organizationId: "dev-team" },
      { token: "beta", organizationId: "finance-team" },
      { token: "legacy-token" },
    ]);
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

  it.each([
    ["leading comma", ",alpha-token"],
    ["trailing comma", "alpha-token,"],
    ["repeated comma", "alpha-token,,legacy-token"],
    ["whitespace-only entry", "alpha-token,  ,legacy-token"],
  ])("rejects blank comma-list entries: %s", (_label, value) => {
    expect(() => loadBearerTokens({ MEMORY_API_TOKENS: value })).toThrow(
      /Invalid MEMORY_API_TOKENS entry: entries must not be blank/i,
    );
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
