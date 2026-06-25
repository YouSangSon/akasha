import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("public documentation drift checks", () => {
  it("does not describe reindex orphan vectors as an open pgvector follow-up", () => {
    expect(read("src/vector/pgvector-index.ts")).not.toContain(
      "ORPHAN VECTORS ON REINDEX (KNOWN FOLLOW-UP)",
    );
  });

  it("documents descriptor-driven tool validation in API docs", () => {
    expect(read("docs/api-reference.md")).toContain("shared tool schema");
    expect(read("docs/api-reference.ko.md")).toContain("공유 tool schema");
    expect(read("docs/api-reference.md")).toContain("src/mcp/tool-handlers.ts");
    expect(read("docs/api-reference.ko.md")).toContain("src/mcp/tool-handlers.ts");
    expect(read("docs/api-reference.md")).not.toContain("src/mcp/server.ts");
    expect(read("docs/api-reference.ko.md")).not.toContain("src/mcp/server.ts");
  });

  it("documents non-root container runtime in security docs", () => {
    expect(read("docs/security.md")).toContain("non-root");
    expect(read("docs/security.ko.md")).toContain("non-root");
  });
});
