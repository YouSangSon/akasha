import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_ROUTES } from "../../src/mcp/tool-schemas.js";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

function migrationNumbers(): number[] {
  return fs
    .readdirSync("src/db/migrations")
    .flatMap((filename) => {
      const match = /^(\d{3})_.*\.sql$/.exec(filename);
      return match ? [Number(match[1])] : [];
    })
    .sort((a, b) => a - b);
}

function currentMigrationRange(): string {
  const numbers = migrationNumbers();
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("No migrations found");
  }
  return `${String(first).padStart(3, "0")}-${String(last).padStart(3, "0")}`;
}

function nextMigrationPrefix(): string {
  const numbers = migrationNumbers();
  const last = numbers[numbers.length - 1];
  if (last === undefined) {
    throw new Error("No migrations found");
  }
  return `${String(last + 1).padStart(3, "0")}_`;
}

const docsIndexFiles = new Set(["docs/README.md", "docs/README.ko.md"]);

function publicDocsMarkdownPaths(): string[] {
  return execFileSync("git", ["ls-files", "docs"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((docPath) => docPath.endsWith(".md"))
    .filter((docPath) => !docPath.startsWith("docs/superpowers/"))
    .filter((docPath) => !docsIndexFiles.has(docPath))
    .sort();
}

function isKoreanDocPath(docPath: string): boolean {
  return docPath.endsWith(".ko.md");
}

function englishSiblingPath(docPath: string): string {
  return docPath.replace(/\.ko\.md$/, ".md");
}

function koreanSiblingPath(docPath: string): string {
  return docPath.replace(/\.md$/, ".ko.md");
}

function docsIndexLinkPath(docPath: string): string {
  return docPath.replace(/^docs\//, "");
}

function markdownLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+]\(([^)]+)\)/g)].map(
    (match) => match[1] ?? "",
  );
}

function snippetsAround(text: string, needle: string, radius = 120): string[] {
  const snippets: string[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    snippets.push(
      text.slice(Math.max(0, index - radius), index + needle.length + radius),
    );
    index = text.indexOf(needle, index + needle.length);
  }
  return snippets;
}

describe("public documentation drift checks", () => {
  it("indexes every paired public docs page", () => {
    const publicDocs = publicDocsMarkdownPaths();
    const englishDocs = publicDocs.filter((docPath) => !isKoreanDocPath(docPath));
    const koreanDocs = publicDocs.filter(isKoreanDocPath);

    for (const docPath of englishDocs) {
      expect(publicDocs).toContain(koreanSiblingPath(docPath));
    }
    for (const docPath of koreanDocs) {
      expect(publicDocs).toContain(englishSiblingPath(docPath));
    }

    const englishIndexLinks = markdownLinkTargets(read("docs/README.md"));
    const koreanIndexLinks = markdownLinkTargets(read("docs/README.ko.md"));
    for (const docPath of englishDocs) {
      const englishLink = docsIndexLinkPath(docPath);
      const koreanLink = docsIndexLinkPath(koreanSiblingPath(docPath));
      const englishIndexEnglishPosition = englishIndexLinks.indexOf(englishLink);
      const englishIndexKoreanPosition = englishIndexLinks.indexOf(koreanLink);
      const koreanIndexKoreanPosition = koreanIndexLinks.indexOf(koreanLink);
      const koreanIndexEnglishPosition = koreanIndexLinks.indexOf(englishLink);

      expect(englishIndexEnglishPosition).toBeGreaterThanOrEqual(0);
      expect(englishIndexKoreanPosition).toBeGreaterThanOrEqual(0);
      expect(englishIndexEnglishPosition).toBeLessThan(englishIndexKoreanPosition);

      expect(koreanIndexKoreanPosition).toBeGreaterThanOrEqual(0);
      expect(koreanIndexEnglishPosition).toBeGreaterThanOrEqual(0);
      expect(koreanIndexKoreanPosition).toBeLessThan(koreanIndexEnglishPosition);
    }
  });

  it("documents Node 22 as the minimum supported runtime", () => {
    const packageJson = readJson<{ engines: { node: string } }>("package.json");
    const packageLock = readJson<{ packages: Record<string, { engines?: { node?: string } }> }>(
      "package-lock.json",
    );

    expect(packageJson.engines.node).toBe(">=22");
    expect(packageLock.packages[""]?.engines?.node).toBe(">=22");

    const publicDocs = [
      "README.md",
      "README.ko.md",
      "docs/troubleshooting.md",
      "docs/troubleshooting.ko.md",
    ];
    for (const path of publicDocs) {
      const text = read(path);
      expect(text).toContain("Node.js ≥ 22");
      expect(text).not.toContain("Node.js ≥ 20");
    }

    for (const path of ["README.md", "README.ko.md"]) {
      const text = read(path);
      expect(text).toContain("node-%3E%3D22");
      expect(text).not.toContain("node-%3E%3D20");
    }

    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain('node: ["22", "24"]');
    expect(ci).not.toContain('"20"');

    const installer = read("install.sh");
    expect(installer).toContain("Node.js ≥ 22");
    expect(installer).toContain("NODE_MAJOR\" -lt 22");
    expect(installer).not.toContain("Node.js ≥ 20");
    expect(installer).not.toContain("NODE_MAJOR\" -lt 20");
  });

  it("documents transformers as a packaged runtime dependency", () => {
    const packageJson = readJson<{
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>("package.json");

    expect(packageJson.dependencies).toHaveProperty("@huggingface/transformers");
    expect(packageJson.optionalDependencies ?? {}).not.toHaveProperty(
      "@huggingface/transformers",
    );

    for (const path of [
      "src/config.ts",
      "src/embedding/transformers-embedding.ts",
      "docs/configuration.md",
      "docs/configuration.ko.md",
      "docs/architecture.md",
      "docs/architecture.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("@huggingface/transformers");
      for (const snippet of snippetsAround(text, "@huggingface/transformers")) {
        expect(snippet).not.toMatch(/optional(?:\s+runtime)?\s+dep/i);
        expect(snippet).not.toContain("optional dependency");
        expect(snippet).not.toContain("optionalDependencies");
      }
    }

    expect(read("docs/configuration.md")).toContain(
      "Installed by the project (`@huggingface/transformers`",
    );
    expect(read("docs/configuration.ko.md")).toContain(
      "프로젝트가 설치 (`@huggingface/transformers`",
    );
  });

  it("documents current embedding provider module filenames", () => {
    for (const modulePath of [
      "src/embedding/transformers-embedding.ts",
      "src/embedding/openai-embeddings.ts",
      "src/embedding/local-embedding.ts",
    ]) {
      expect(fs.existsSync(modulePath)).toBe(true);
      expect(read("docs/architecture.md")).toContain(modulePath);
      expect(read("docs/architecture.ko.md")).toContain(modulePath);
    }

    for (const path of ["docs/architecture.md", "docs/architecture.ko.md"]) {
      expect(read(path)).not.toContain("src/embedding/local-embeddings.ts");
    }
  });

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
    expect(readme).toContain("inspect_memory_graph");
    expect(readme).toContain("/v1/memory/graph");
    expect(readmeKo).toContain("MCP Streamable HTTP");
    expect(readmeKo).toContain("POST /mcp");
    expect(readmeKo).toContain("공유 MCP 서버 surface");
    expect(readmeKo).toContain("`/mcp` 의 MCP Streamable HTTP 와 `/v1/*` 아래 JSON HTTP");
    expect(readmeKo).toContain("inspect_memory_graph");
    expect(readmeKo).toContain("/v1/memory/graph");

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
    expect(apiReference).toContain("inspect_memory_graph");
    expect(apiReference).toContain("POST /v1/memory/graph");

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
    expect(apiReferenceKo).toContain("inspect_memory_graph");
    expect(apiReferenceKo).toContain("POST /v1/memory/graph");
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
      expect(text).toContain("--content-file");
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
    const range = currentMigrationRange();
    const next = nextMigrationPrefix();
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
      expect(text).toContain(range);
      expect(text).not.toContain("001-010");
      expect(text).not.toContain("001-009");
      expect(text).not.toContain("001-011");
      expect(text).not.toContain("001–008");
      expect(text).not.toContain("001-008");
      expect(text).not.toContain("001-012");
    }

    expect(read("CONTRIBUTING.md")).toContain(next);
    expect(read("CONTRIBUTING.ko.md")).toContain(next);
  });

  it("documents every service tool and JSON HTTP route in public docs", () => {
    const docs = [
      "README.md",
      "README.ko.md",
      "docs/api-reference.md",
      "docs/api-reference.ko.md",
    ];

    for (const path of docs) {
      const text = read(path);
      expect(text).toContain(`${TOOL_ROUTES.length} service tools`);
      for (const route of TOOL_ROUTES) {
        expect(text).toContain(route.name);
        expect(text).toContain(route.path);
      }
    }
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

    for (const path of ["docs/configuration.md", "docs/configuration.ko.md"]) {
      expect(read(path)).toContain("inspect_memory_graph");
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
      expect(text).toContain("type ContextPackSelectionRationale = {");
      expect(text).toContain("selectionRationale: ContextPackSelectionRationale[];");
      expect(text).toContain("inputRank: number;");
      expect(text).toContain("type InspectMemoryGraphInput = {");
      expect(text).toContain("type MemoryGraphEntity = {");
      expect(text).toContain("type MemoryGraphRelationship = {");
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
      "docs/operations.md",
      "docs/operations.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("${QDRANT_COLLECTION_NAME}");
      expect(text).toContain("http://127.0.0.1:6333/collections/");
      expect(text).toContain(
        "/collections/${QDRANT_COLLECTION_NAME}/snapshots/upload?priority=snapshot",
      );
      expect(text).not.toContain("docker compose exec qdrant curl -X POST");
      expect(text).not.toContain("/collections/memory_chunks_v1/snapshots/upload");
    }

    for (const path of [
      "docs/self-hosted-operations.md",
      "docs/self-hosted-operations.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain(
        "$RESTORE_SMOKE_QDRANT_COLLECTION_NAME/snapshots/upload?priority=snapshot",
      );
      expect(text).not.toContain("/collections/memory_chunks_v1/snapshots/upload");
    }
    expect(read("scripts/restore-smoke.ts")).toContain(
      "RESTORE_SMOKE_QDRANT_COLLECTION_NAME",
    );

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

  it("documents the dedicated worker metrics boundary", () => {
    for (const path of ["docs/api-reference.md", "docs/operations.md"]) {
      const text = read(path).replace(/\s+/g, " ");
      expect(text).toContain(
        "dedicated `npm run start:worker` process currently has no HTTP metrics listener",
      );
      expect(text).toContain("worker process logs for tick activity");
      expect(text).toContain("HTTP `/metrics`");
      expect(text).toContain("backlog gauges");
      expect(text).toContain("worker-local metrics endpoint or sidecar");
      expect(text).toContain("per-worker tick counters");
    }

    for (const path of ["docs/api-reference.ko.md", "docs/operations.ko.md"]) {
      const text = read(path).replace(/\s+/g, " ");
      expect(text).toContain(
        "전용 `npm run start:worker` 프로세스에는 현재 HTTP metrics listener가 없습니다",
      );
      expect(text).toContain("worker process log에서 보고");
      expect(text).toContain("HTTP `/metrics`");
      expect(text).toContain("backlog gauge");
      expect(text).toContain("worker-local metrics endpoint 또는 sidecar");
      expect(text).toContain("per-worker tick counter");
    }

    expect(read("docs/operations.md")).toContain(
      "In-process HTTP sweeper tick metrics",
    );
    expect(read("docs/operations.md")).toContain(
      'akasha_background_queue_rows{queue="compaction",...}',
    );
    expect(read("docs/operations.ko.md")).toContain(
      "HTTP 프로세스 내 sweeper tick metrics",
    );
    expect(read("docs/operations.ko.md")).toContain(
      'akasha_background_queue_rows{queue="compaction",...}',
    );
  });

  it("documents the dedicated background worker command", () => {
    for (const path of [
      "README.md",
      "README.ko.md",
      "docs/configuration.md",
      "docs/configuration.ko.md",
      "docs/deployment.md",
      "docs/deployment.ko.md",
      "docs/operations.md",
      "docs/operations.ko.md",
      "docs/api-reference.md",
      "docs/api-reference.ko.md",
    ]) {
      expect(read(path)).toContain("npm run start:worker");
    }

    for (const path of ["README.md", "README.ko.md", "package.json"]) {
      expect(read(path)).toContain("dev:worker");
    }
  });
});
