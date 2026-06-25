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

  it("documents MCP streamable HTTP, resources, and prompts in public docs", () => {
    const readme = read("README.md");
    const readmeKo = read("README.ko.md");
    const apiReference = read("docs/api-reference.md");
    const apiReferenceKo = read("docs/api-reference.ko.md");

    expect(readme).toContain("MCP Streamable HTTP");
    expect(readme).toContain("POST /mcp");
    expect(readme).toContain("Shared MCP server surface");
    expect(readme).toContain("Serves MCP Streamable HTTP at `/mcp` plus JSON HTTP under `/v1/*`");
    expect(readmeKo).toContain("MCP Streamable HTTP");
    expect(readmeKo).toContain("POST /mcp");
    expect(readmeKo).toContain("공유 MCP 서버 surface");
    expect(readmeKo).toContain("`/mcp` 의 MCP Streamable HTTP 와 `/v1/*` 아래 JSON HTTP");

    expect(apiReference).toContain("MCP Streamable HTTP");
    expect(apiReference).toContain("POST /mcp");
    expect(apiReference).toContain("three access paths");
    expect(apiReference).not.toContain("Both transports share");
    expect(apiReference).toContain("When `MEMORY_API_TOKENS` is configured, every `/mcp` and `/v1/*` route requires");
    expect(apiReference).toContain("a bearer token. `/healthz` and `/readyz` are unauthenticated. For local");
    expect(apiReference).toContain("development only, an empty token list is allowed when the server binds to loopback");
    expect(apiReference).toContain("akasha_session_start");
    expect(apiReference).toContain("akasha_store_memory");
    expect(apiReference).toContain("akasha://memory/recent/{projectKey}");
    expect(apiReference).toContain("akasha://context-pack/{projectKey}/{task}");

    expect(apiReferenceKo).toContain("MCP Streamable HTTP");
    expect(apiReferenceKo).toContain("POST /mcp");
    expect(apiReferenceKo).toContain("세 가지 접근 경로");
    expect(apiReferenceKo).not.toContain("두 transport 모두");
    expect(apiReferenceKo).toContain("`MEMORY_API_TOKENS` 가 설정되어 있으면 모든 `/mcp`, `/v1/*` 라우트에 bearer");
    expect(apiReferenceKo).toContain("토큰이 필요합니다. `/healthz`, `/readyz` 는 인증 없음. 로컬 개발에서만 토큰 목록이");
    expect(apiReferenceKo).toContain("로컬 개발에서만 토큰 목록이");
    expect(apiReferenceKo).toContain("비어 있어도 loopback (`127.0.0.1`, `localhost`, `::1`) 바인딩이면 허용됩니다.");
    expect(apiReferenceKo).toContain("akasha_session_start");
    expect(apiReferenceKo).toContain("akasha_store_memory");
    expect(apiReferenceKo).toContain("akasha://memory/recent/{projectKey}");
    expect(apiReferenceKo).toContain("akasha://context-pack/{projectKey}/{task}");
  });

  it("documents the current audit instrumentation module in architecture docs", () => {
    expect(read("docs/architecture.md")).toContain(
      "instrument()`\nwrapper in `src/mcp/tool-registry.ts`",
    );
    expect(read("docs/architecture.ko.md")).toContain(
      "`src/mcp/tool-registry.ts` 의 `instrument()` wrapper",
    );
    expect(read("docs/architecture.md")).not.toContain(
      "instrument()`\nwrapper in `src/mcp/server.ts`",
    );
    expect(read("docs/architecture.ko.md")).not.toContain(
      "`src/mcp/server.ts` 의 `instrument()` wrapper",
    );
  });

  it("documents non-root container runtime in security docs", () => {
    expect(read("docs/security.md")).toContain("non-root");
    expect(read("docs/security.ko.md")).toContain("non-root");
  });
});
