import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { resolveOrganizationId } from "../../src/app/routes/memory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(orgHeader?: string): IncomingMessage {
  return {
    headers: orgHeader ? { "x-organization-id": orgHeader } : {},
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// resolveOrganizationId — precedence logic
// ---------------------------------------------------------------------------

describe("resolveOrganizationId", () => {
  describe("token binding takes precedence (no conflict)", () => {
    it("returns the token-bound org when no caller org is provided", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t", organizationId: "dev-team" };

      // Act
      const result = resolveOrganizationId(req, undefined, auth);

      // Assert
      expect(result.organizationId).toBe("dev-team");
      expect(result.conflict).toBe(false);
    });

    it("returns the token-bound org when the caller org matches the token", () => {
      // Arrange
      const req = makeReq("dev-team");
      const auth = { token: "t", organizationId: "dev-team" };

      // Act
      const result = resolveOrganizationId(req, undefined, auth);

      // Assert
      expect(result.organizationId).toBe("dev-team");
      expect(result.conflict).toBe(false);
    });

    it("overrides body.organizationId with the token-bound org when both match", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t", organizationId: "dev-team" };

      // Act
      const result = resolveOrganizationId(req, "dev-team", auth);

      // Assert
      expect(result.organizationId).toBe("dev-team");
      expect(result.conflict).toBe(false);
    });
  });

  describe("token binding vs caller org mismatch → conflict:true", () => {
    it("signals conflict when body.organizationId differs from token binding", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t", organizationId: "dev-team" };

      // Act
      const result = resolveOrganizationId(req, "finance-team", auth);

      // Assert
      expect(result.conflict).toBe(true);
      // organizationId is still set to the token-bound value even on conflict
      expect(result.organizationId).toBe("dev-team");
    });

    it("signals conflict when x-organization-id header differs from token binding", () => {
      // Arrange
      const req = makeReq("finance-team");
      const auth = { token: "t", organizationId: "dev-team" };

      // Act
      const result = resolveOrganizationId(req, undefined, auth);

      // Assert
      expect(result.conflict).toBe(true);
      expect(result.organizationId).toBe("dev-team");
    });
  });

  describe("no token binding: header beats body, body beats undefined", () => {
    it("uses x-organization-id header when token has no binding", () => {
      // Arrange
      const req = makeReq("ops-team");
      const auth = { token: "t" }; // no organizationId

      // Act
      const result = resolveOrganizationId(req, undefined, auth);

      // Assert
      expect(result.organizationId).toBe("ops-team");
      expect(result.conflict).toBe(false);
    });

    it("prefers x-organization-id header over body.organizationId when no binding", () => {
      // Arrange
      const req = makeReq("header-org");
      const auth = { token: "t" };

      // Act
      const result = resolveOrganizationId(req, "body-org", auth);

      // Assert
      expect(result.organizationId).toBe("header-org");
      expect(result.conflict).toBe(false);
    });

    it("falls back to body.organizationId when header is absent and token has no binding", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t" };

      // Act
      const result = resolveOrganizationId(req, "body-org", auth);

      // Assert
      expect(result.organizationId).toBe("body-org");
      expect(result.conflict).toBe(false);
    });

    it("returns undefined organizationId when no source provides one", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t" };

      // Act
      const result = resolveOrganizationId(req, undefined, auth);

      // Assert
      expect(result.organizationId).toBeUndefined();
      expect(result.conflict).toBe(false);
    });
  });

  describe("null or undefined auth (no bearer at all)", () => {
    it("uses header org when auth is null", () => {
      // Arrange
      const req = makeReq("ops-team");

      // Act
      const result = resolveOrganizationId(req, undefined, null);

      // Assert
      expect(result.organizationId).toBe("ops-team");
      expect(result.conflict).toBe(false);
    });

    it("uses body org when auth is undefined and header is absent", () => {
      // Arrange
      const req = makeReq();

      // Act
      const result = resolveOrganizationId(req, "body-org", undefined);

      // Assert
      expect(result.organizationId).toBe("body-org");
      expect(result.conflict).toBe(false);
    });

    it("returns undefined org and no conflict when all sources are absent", () => {
      // Arrange
      const req = makeReq();

      // Act
      const result = resolveOrganizationId(req, undefined, undefined);

      // Assert
      expect(result.organizationId).toBeUndefined();
      expect(result.conflict).toBe(false);
    });
  });

  describe("edge cases: empty or whitespace org values are ignored", () => {
    it("treats an empty-string body.organizationId as absent", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t" };

      // Act
      const result = resolveOrganizationId(req, "", auth);

      // Assert
      expect(result.organizationId).toBeUndefined();
    });

    it("treats a whitespace-only body.organizationId as absent", () => {
      // Arrange
      const req = makeReq();
      const auth = { token: "t" };

      // Act
      const result = resolveOrganizationId(req, "   ", auth);

      // Assert
      expect(result.organizationId).toBeUndefined();
    });
  });
});
