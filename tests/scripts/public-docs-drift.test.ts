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
    expect(apiReference).toContain("When `MEMORY_API_TOKENS` or OAuth token validation is configured, every `/mcp`");
    expect(apiReference).toContain("and `/v1/*` route requires a bearer token. Static tokens are configured via");
    expect(apiReference).toContain("OAuth/OIDC JWT access tokens are accepted");
    expect(apiReference).toContain("static `/admin/memory` shell");
    expect(apiReference).toContain("JSON calls still target the authenticated `/v1/*` API");
    expect(apiReference).toContain("For local development");
    expect(apiReference).toContain("only, an empty token list is allowed when the server binds to");
    expect(apiReference).toContain("(`127.0.0.1`, `localhost`, or `::1`); binding to a non-loopback host");
    expect(apiReference).toContain("static tokens or OAuth token validation fails at startup");
    expect(apiReference).toContain("akasha_session_start");
    expect(apiReference).toContain("akasha_store_memory");
    expect(apiReference).toContain("akasha://memory/recent/{projectKey}");
    expect(apiReference).toContain("akasha://context-pack/{projectKey}/{task}");
    expect(apiReference).toContain("mergedIds: string[];");
    expect(apiReference).toContain("list_workspace_roots");
    expect(apiReference).toContain("add_memory_interactive");
    expect(apiReference).toContain("classify_memory_candidate");

    expect(apiReferenceKo).toContain("MCP Streamable HTTP");
    expect(apiReferenceKo).toContain("dist/src/mcp/server.js");
    expect(apiReferenceKo).not.toContain("진입점: `dist/src/cli.js`");
    expect(apiReferenceKo).toContain("POST /mcp");
    expect(apiReferenceKo).toContain("세 가지 접근 경로");
    expect(apiReferenceKo).not.toContain("두 transport 모두");
    expect(apiReferenceKo).toContain("`MEMORY_API_TOKENS` 또는 OAuth token validation이 설정되어 있으면 모든");
    expect(apiReferenceKo).toContain("`/mcp`, `/v1/*` 라우트에 bearer 토큰이 필요합니다. Static token은");
    expect(apiReferenceKo).toContain("OAuth/OIDC JWT access token은");
    expect(apiReferenceKo).toContain("static token 또는 OAuth token validation 없이 non-loopback host에 바인딩하면");
    expect(apiReferenceKo).toContain("akasha_session_start");
    expect(apiReferenceKo).toContain("akasha_store_memory");
    expect(apiReferenceKo).toContain("akasha://memory/recent/{projectKey}");
    expect(apiReferenceKo).toContain("akasha://context-pack/{projectKey}/{task}");
    expect(apiReferenceKo).toContain("mergedIds: string[];");
    expect(apiReferenceKo).toContain("list_workspace_roots");
    expect(apiReferenceKo).toContain("add_memory_interactive");
    expect(apiReferenceKo).toContain("classify_memory_candidate");
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
      expect(text).toContain("node dist/src/cli.js init");
      expect(text).toContain(".akasha/mcp/claude-desktop.json");
      expect(text).toContain(".akasha/mcp/codex.toml");
      expect(text).toContain(".akasha/hooks/session-start.sh");
      expect(text).toContain(".akasha/hooks/session-end.sh");
      expect(text).toContain("node dist/src/cli.js pack");
      expect(text).toContain("node dist/src/cli.js remember");
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
      expect(text).toContain("001-012");
      expect(text).not.toContain("001-010");
      expect(text).not.toContain("001-009");
      expect(text).not.toContain("001-011");
      expect(text).not.toContain("001–008");
      expect(text).not.toContain("001-008");
    }

    expect(read("CONTRIBUTING.md")).toContain("013_");
    expect(read("CONTRIBUTING.ko.md")).toContain("013_");
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
      expect(text).toContain("MCP_OAUTH_JWKS_URLS");
      expect(text).toContain("MCP_OAUTH_JWT_ALGORITHMS");
      expect(text).toContain("MCP_OAUTH_ORGANIZATION_CLAIM");
      expect(text).toContain("MCP_OAUTH_RESOURCE_NAME");
      expect(text).toContain("MCP_OAUTH_RESOURCE_DOCUMENTATION_URL");
      expect(text).toContain("/.well-known/oauth-protected-resource");
    }

    for (const path of ["docs/security.md", "docs/security.ko.md"]) {
      const text = read(path);
      expect(text).toContain("MCP_OAUTH_AUTHORIZATION_SERVERS");
      expect(text).toContain("WWW-Authenticate");
      expect(text).toContain("MEMORY_API_TOKENS");
      expect(text).toContain("JWKS");
      expect(text).toContain("insufficient_scope");
    }
  });

  it("documents context-pack prompt-injection trust boundaries", () => {
    for (const path of [
      "docs/api-reference.md",
      "docs/api-reference.ko.md",
      "docs/security.md",
      "docs/security.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("trust-boundary");
      expect(text).toContain("untrusted");
      expect(text).toContain("prompt-injection");
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
    expect(read("scripts/create-backup.sh")).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(read("package.json")).toContain("backup:create:pgvector");
    expect(read("package.json")).toContain("backup:decrypt");

    for (const path of ["README.md", "README.ko.md"]) {
      const text = read(path);
      expect(text).toContain("npm run backup:create");
      expect(text).toContain("npm run backup:create:pgvector");
      expect(text).toContain("scripts/snapshot-qdrant.sh");
      expect(text).toContain("QDRANT_URL");
      expect(text).toContain("VECTOR_BACKEND=pgvector");
      expect(text).toContain("BACKUP_ENCRYPTION_KEY_FILE");
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

    for (const path of [
      ".env.example",
      "docs/self-hosted-operations.md",
      "docs/self-hosted-operations.ko.md",
      "docs/security.md",
      "docs/security.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("BACKUP_ENCRYPTION_KEY_FILE");
      expect(text).toContain("AES-256-GCM");
    }
  });

  it("documents the native Prometheus metrics endpoint", () => {
    for (const path of [
      "docs/api-reference.md",
      "docs/api-reference.ko.md",
      "docs/operations.md",
      "docs/operations.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("GET /metrics");
      expect(text).toContain("text/plain; version=0.0.4");
      expect(text).toContain("akasha_http_requests_total");
      expect(text).toContain("akasha_http_request_duration_seconds");
      expect(text).toContain("akasha_dependency_up");
      expect(text).toContain("/readyz");
      expect(text).not.toContain("No native metrics export today");
      expect(text).not.toContain("네이티브 metrics export 없음");
    }
  });
});
