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
    expect(apiReference).toContain("dist/src/mcp/server.js");
    expect(apiReference).not.toContain("Entry point: `dist/src/cli.js`");
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
    expect(apiReference).toContain("mergedIds: string[];");

    expect(apiReferenceKo).toContain("MCP Streamable HTTP");
    expect(apiReferenceKo).toContain("dist/src/mcp/server.js");
    expect(apiReferenceKo).not.toContain("진입점: `dist/src/cli.js`");
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
    expect(apiReferenceKo).toContain("mergedIds: string[];");
  });

  it("documents agent lifecycle integrations", () => {
    const index = read("docs/README.md");
    const indexKo = read("docs/README.ko.md");
    const integrations = read("docs/integrations.md");
    const integrationsKo = read("docs/integrations.ko.md");

    expect(index).toContain("integrations.md");
    expect(indexKo).toContain("integrations.ko.md");
    for (const text of [integrations, integrationsKo]) {
      expect(text).toContain("dist/src/mcp/server.js");
      expect(text).toContain("akasha_session_start");
      expect(text).toContain("akasha_store_memory");
      expect(text).toContain("node dist/src/cli.js pack");
      expect(text).toContain("--organization-id");
    }
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

  it("documents the current migration range and next migration number", () => {
    const files = [
      "AGENTS.md",
      "CONTRIBUTING.md",
      "CONTRIBUTING.ko.md",
      "docs/architecture.md",
      "docs/architecture.ko.md",
      "docs/operations.md",
      "docs/operations.ko.md",
    ];

    for (const path of files) {
      const text = read(path);
      expect(text).toContain("001-009");
      expect(text).not.toContain("001–008");
      expect(text).not.toContain("001-008");
    }

    expect(read("CONTRIBUTING.md")).toContain("010_");
    expect(read("CONTRIBUTING.ko.md")).toContain("010_");
  });

  it("documents all three public transports in architecture and security docs", () => {
    for (const path of [
      "docs/architecture.md",
      "docs/architecture.ko.md",
      "docs/security.md",
      "docs/security.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("/mcp");
      expect(text).toContain("/v1/*");
      expect(text).toContain("MCP Streamable HTTP");
    }
  });

  it("documents OAuth protected-resource discovery configuration and security limits", () => {
    for (const path of [
      ".env.example",
      "docs/configuration.md",
      "docs/configuration.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("MCP_OAUTH_AUTHORIZATION_SERVERS");
      expect(text).toContain("MCP_OAUTH_RESOURCE_URL");
      expect(text).toContain("MCP_OAUTH_SCOPES");
      expect(text).toContain("MCP_OAUTH_RESOURCE_NAME");
      expect(text).toContain("MCP_OAUTH_RESOURCE_DOCUMENTATION_URL");
      expect(text).toContain("/.well-known/oauth-protected-resource");
    }

    for (const path of ["docs/security.md", "docs/security.ko.md"]) {
      const text = read(path);
      expect(text).toContain("MCP_OAUTH_AUTHORIZATION_SERVERS");
      expect(text).toContain("WWW-Authenticate");
      expect(text).toContain("MEMORY_API_TOKENS");
      expect(text).toContain("discovery");
    }
  });

  it("keeps API reference examples aligned with tool schemas and context-pack output", () => {
    const api = read("docs/api-reference.md");
    const apiKo = read("docs/api-reference.ko.md");

    expect(api).toContain("decision | summary | fact");
    expect(apiKo).toContain("decision | summary | fact");
    expect(api).toContain("sections: {");
    expect(apiKo).toContain("sections: {");
    expect(api).toContain("project_summary");
    expect(apiKo).toContain("project_summary");
    for (const path of ["docs/api-reference.md", "docs/api-reference.ko.md"]) {
      const text = read(path);
      expect(text).toMatch(/type SearchMemoryResult = \{\n\s+id: number;/);
      expect(text).toContain("source: {");
      expect(text).not.toMatch(/type SearchMemoryResult = \{\n\s+ok: true;/);
      expect(text).toMatch(/type SearchMemoryResponse = \{\n\s+ok: true;/);
      expect(text).toContain("results: SearchMemoryResult[];");
      for (const section of [
        "project_summary",
        "recent_decisions",
        "constraints",
        "open_questions",
        "relevant_notes",
      ]) {
        expect(text).toContain(`${section}: SearchMemoryResult[];`);
      }
      expect(text).not.toContain("MemoryRecord[]");
    }
    expect(api).toContain("structuredContent");
    expect(apiKo).toContain("structuredContent");
    expect(api).toContain("text content item");
    expect(apiKo).toContain("text content item");
  });

  it("keeps public README search examples free of internal scores", () => {
    for (const path of ["README.md", "README.ko.md"]) {
      const text = read(path);
      expect(text).not.toMatch(/"score"\s*:/);
    }
  });

  it("records PR 19 MCP changes in both changelogs", () => {
    for (const path of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
      const text = read(path);
      expect(text).toContain("#19");
      expect(text).toContain("/mcp");
      expect(text).toContain("resources");
      expect(text).toContain("prompts");
      expect(text).toContain("structured");
    }
  });

  it("documents backup differences for Qdrant and pgvector backends", () => {
    expect(read("package.json")).toContain("./scripts/create-backup.sh");
    expect(read("scripts/create-backup.sh")).toContain("./scripts/snapshot-qdrant.sh");
    expect(read("package.json")).toContain("backup:create:pgvector");

    for (const path of ["README.md", "README.ko.md"]) {
      const text = read(path);
      expect(text).toContain("npm run backup:create");
      expect(text).toContain("npm run backup:create:pgvector");
      expect(text).toContain("scripts/snapshot-qdrant.sh");
      expect(text).toContain("QDRANT_URL");
      expect(text).toContain("VECTOR_BACKEND=pgvector");
      expect(text).toMatch(/logical vector data lives in\s+Postgres/);
      expect(/skips|건너뛰/.test(text)).toBe(true);
      expect(text).not.toContain("later script split");
      expect(text).not.toContain("Qdrant-oriented until");
    }

    for (const path of [
      "docs/operations.md",
      "docs/operations.ko.md",
      "docs/self-hosted-operations.md",
      "docs/self-hosted-operations.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("VECTOR_BACKEND=qdrant");
      expect(text).toContain("VECTOR_BACKEND=pgvector");
      expect(text).toContain("Postgres");
      expect(text).toContain("Qdrant");
      expect(text).toContain("scripts/snapshot-qdrant.sh");
      expect(text).toContain("QDRANT_URL");
      expect(text).toContain("logical data path");
      expect(text).toContain("backup:create:pgvector");
      expect(text).not.toContain("later script split");
      expect(text).not.toContain("still invokes");
    }
  });
});
