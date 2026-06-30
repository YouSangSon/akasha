import { describe, expect, it } from "vitest";
import {
  assertOptionalVectorOrganizationId,
  assertVectorOrganizationId,
} from "../../src/vector/organization-id.js";

describe("vector organization id validation", () => {
  it("rejects non-string required organizationId with a clear message", () => {
    expect(() => assertVectorOrganizationId(123 as never)).toThrow(
      "organizationId must be a string",
    );
  });

  it("allows omitted and empty optional organizationId", () => {
    expect(() => assertOptionalVectorOrganizationId(undefined)).not.toThrow();
    expect(() => assertOptionalVectorOrganizationId("")).not.toThrow();
  });

  it("rejects non-string optional organizationId with a clear message", () => {
    expect(() => assertOptionalVectorOrganizationId(123 as never)).toThrow(
      "organizationId must be a string",
    );
  });

  it("rejects whitespace-only optional organizationId", () => {
    expect(() => assertOptionalVectorOrganizationId(" \n\t ")).toThrow(
      "organizationId must not be blank",
    );
  });
});
