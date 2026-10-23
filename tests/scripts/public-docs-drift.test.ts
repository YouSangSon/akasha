import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_ROUTES } from "../../src/mcp/tool-schemas.js";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
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

function unreleasedChangelogSection(path: string): string {
  const text = read(path);
  const headingMatch = /^## \[Unreleased]\s*$/m.exec(text);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(`${path} does not contain an Unreleased section`);
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const nextReleaseStart = text.indexOf("\n## [", sectionStart);
  return text.slice(
    sectionStart,
    nextReleaseStart === -1 ? text.length : nextReleaseStart,
  );
}

function unreleasedChangelogBulletContaining(path: string, needle: string): string {
  const section = `${unreleasedChangelogSection(path)}\n### `;
  const bullets = [...section.matchAll(/^- [\s\S]*?(?=^- |^### )/gm)].map(
    (match) => match[0],
  );
  const bullet = bullets.find((entry) => entry.includes(needle));
  if (!bullet) {
    throw new Error(`${path} Unreleased section does not contain ${needle}`);
  }
  return bullet;
}

function migrationRanges(markdown: string): string[] {
  return [...markdown.matchAll(/\b\d{3}-\d{3}\b/g)].map((match) => match[0]);
}

function issueTemplateDropdownOptions(templatePath: string, fieldId: string): string[] {
  const template = read(templatePath);
  const optionsBlock = new RegExp(
    `id: ${fieldId}[\\s\\S]*?options:\\n((?:        - .+\\n)+)`,
  ).exec(template)?.[1];

  expect(optionsBlock).toBeDefined();
  return [...(optionsBlock ?? "").matchAll(/^\s+- "?(.+?)"?$/gm)].map(
    (match) => match[1],
  );
}

describe("public documentation drift checks", () => {
  it("keeps contributor verification guidance aligned", () => {
    const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
    const readme = read("README.md");
    const readmeKo = read("README.ko.md");
    const contributing = read("CONTRIBUTING.md");
    const contributingKo = read("CONTRIBUTING.ko.md");
    const troubleshooting = read("docs/troubleshooting.md");
    const troubleshootingKo = read("docs/troubleshooting.ko.md");

    for (const command of [
      "npm run typecheck",
      "npm run build",
      "npm run audit:dependencies",
      "npm test",
    ]) {
      expect(prTemplate).toContain(command);
      expect(readme).toContain(command);
      expect(readmeKo).toContain(command);
      expect(contributing).toContain(command);
      expect(contributingKo).toContain(command);
    }

    expect(prTemplate).toContain("`npm run typecheck` passes");
    expect(prTemplate).toContain("`npm run build` passes");
    expect(prTemplate).toContain(
      "`npm run audit:dependencies` reports 0 vulnerabilities",
    );
    expect(prTemplate).toContain("`npm test` passes");
    expect(contributing).toContain(
      "| Dependency audit | `npm run audit:dependencies` |",
    );
    expect(contributingKo).toContain(
      "| 의존성 감사 | `npm run audit:dependencies` |",
    );
    expect(contributing).toContain("| Run all tests | `npm test` |");
    expect(contributingKo).toContain("| 모든 테스트 실행 | `npm test` |");
    expect(contributing).toContain("tests/vector/pgvector-index.integration.test.ts");
    expect(contributing).toContain("PGVECTOR_TEST_URL");
    expect(contributingKo).toContain("tests/vector/pgvector-index.integration.test.ts");
    expect(contributingKo).toContain("PGVECTOR_TEST_URL");
    expect(troubleshooting).toContain("PGVECTOR_TEST_URL");
    expect(troubleshootingKo).toContain("PGVECTOR_TEST_URL");
    expect(contributing).not.toContain("Tests + typecheck pass locally");
    expect(contributingKo).not.toContain("테스트 + 타입 체크 로컬 통과");
    expect(contributing).not.toContain("The 3 PG-dependent test files");
    expect(troubleshooting).not.toContain("The 3 PG-dependent test files");
    expect(contributingKo).not.toContain("PG 의존 테스트 3개");
    expect(troubleshootingKo).not.toContain("PG 의존 테스트 3개");
  });

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

  it("keeps Korean public-doc body links on Korean mirrors", () => {
    const expectedKoreanLinks = [
      ["README.ko.md", "docs/README.ko.md"],
      ["CONTRIBUTING.ko.md", "SECURITY.ko.md"],
      ["docs/configuration.ko.md", "operations.ko.md"],
      ["docs/configuration.ko.md", "deployment.ko.md"],
      ["docs/operations.ko.md", "self-hosted-operations.ko.md"],
      ["docs/security.ko.md", "../SECURITY.ko.md"],
      ["docs/troubleshooting.ko.md", "../SECURITY.ko.md"],
    ] as const;

    for (const [path, target] of expectedKoreanLinks) {
      expect(markdownLinkTargets(read(path))).toContain(target);
    }

    const staleEnglishTargets = [
      ["README.ko.md", "docs/README.md"],
      ["CONTRIBUTING.ko.md", "SECURITY.md"],
      ["docs/configuration.ko.md", "operations.md"],
      ["docs/configuration.ko.md", "deployment.md"],
      ["docs/operations.ko.md", "self-hosted-operations.md"],
      ["docs/security.ko.md", "../SECURITY.md"],
      ["docs/troubleshooting.ko.md", "../SECURITY.md"],
    ] as const;

    for (const [path, target] of staleEnglishTargets) {
      expect(markdownLinkTargets(read(path))).not.toContain(target);
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

    const staleUnreleasedNodeSignals = ["Node ≥20", "node-%3E%3D20", "Node 20+22"];
    for (const path of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
      const section = unreleasedChangelogSection(path);
      expect(section).toContain("Node ≥22");
      for (const staleSignal of staleUnreleasedNodeSignals) {
        expect(section).not.toContain(staleSignal);
      }
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

  it("keeps Korean README comparison copy localized", () => {
    const readmeKo = read("README.ko.md");

    expect(readmeKo).toContain("무료/로컬 기본값");
    expect(readmeKo).toContain("비용을 전면에 내세우고");
    expect(readmeKo).toContain("한 단계 더 나아가는 지점");
    expect(readmeKo).toContain("자체 호스팅 메모리 MCP 서버");

    for (const stalePhrase of [
      "MCP 메모리 생태계 norm",
      "무료/로컬 default",
      "cost 를 헤드라인",
      "distinctively",
      "peers 는 skip",
      "hosted 메모리 제품",
      "self-hosted 메모리 MCP 서버",
    ]) {
      expect(readmeKo).not.toContain(stalePhrase);
    }
  });

  it("positions code-intelligence MCP servers as complementary to Akasha memory", () => {
    const readme = collapseWhitespace(read("README.md"));
    const readmeKo = collapseWhitespace(read("README.ko.md"));

    expect(readme).toContain("codebase-memory-mcp");
    expect(readme).toContain("complementary rather than replacements");
    expect(readme).toContain("symbols, routes, call graph, and ADRs");
    expect(readme).toContain("durable agent memory");

    expect(readmeKo).toContain("codebase-memory-mcp");
    expect(readmeKo).toContain("대체재가 아니라 보완재");
    expect(readmeKo).toContain("symbol, route, call graph, ADR");
    expect(readmeKo).toContain("영구 에이전트 메모리");
    expect(readmeKo).not.toContain("complementary rather than replacements");
  });

  it("keeps Korean README comparison table labels localized", () => {
    const readmeKo = read("README.ko.md");

    expect(readmeKo).toContain("❌ (OpenAI 기본값)");
    expect(readmeKo).toContain("❌ (호스팅형)");
    expect(readmeKo).toContain("✅ (Mem0 래핑)");
    expect(readmeKo).toContain("래퍼 전용");
    expect(readmeKo).toContain("| 다양함 | 다양함 | 독점형 |");
    expect(readmeKo).toContain("OSS 경로 활발히 유지");
    expect(readmeKo).toContain("❌ (CE 2025 지원 중단)");

    for (const stalePhrase of [
      "OpenAI default",
      "(hosted)",
      "Mem0 wrap",
      "wrapper 전용",
      "| varies | varies | proprietary |",
      "OSS 경로 active 유지",
      "CE 2025 deprecated",
    ]) {
      expect(readmeKo).not.toContain(stalePhrase);
    }
  });

  it("keeps Korean embedding and setup labels localized", () => {
    for (const path of [
      "README.ko.md",
      "docs/configuration.ko.md",
      "docs/security.ko.md",
      "docs/troubleshooting.ko.md",
    ]) {
      const text = read(path);
      expect(text).not.toContain("결정론적 stub");
      expect(text).not.toContain("CI stub");
      expect(text).not.toContain("CI/offline stub");
    }

    const readmeKo = read("README.ko.md");
    expect(readmeKo).toContain("기본값 그대로 동작");
    expect(readmeKo).toContain("CI용 결정론적 스텁");
    expect(readmeKo).toContain("CI 스텁");
    expect(readmeKo).toContain("VECTOR_BACKEND 기준 백업");
    expect(readmeKo).toContain("Postgres 단독 pgvector 백업");
    expect(readmeKo).not.toContain("default 그대로 동작");
    expect(readmeKo).not.toContain("backend-aware backup");
    expect(readmeKo).not.toContain("Postgres-only pgvector backup");

    const configurationKo = read("docs/configuration.ko.md");
    expect(configurationKo).toContain("무료 로컬 ONNX, 기본값");
    expect(configurationKo).toContain("일반 십진수 양의 정수 벡터 크기");
    expect(configurationKo).not.toContain("무료 로컬 ONNX, default");
    expect(configurationKo).not.toContain("plain decimal positive integer");

    const securityKo = read("docs/security.ko.md");
    expect(securityKo).toContain("CI/오프라인 스텁");
  });

  it("documents current secret scrubber coverage in public docs", () => {
    const scrubber = read("src/store/secret-scrub.ts");
    for (const category of [
      "aws-access-key",
      "github-token",
      "openai-key",
      "anthropic-key",
      "gcp-api-key",
      "stripe-key",
      "slack-token",
      "db-connection-string",
      "private-key-block",
      "bearer-token",
      "jwt",
    ]) {
      expect(scrubber).toContain(`category: "${category}"`);
    }

    for (const path of [
      "README.md",
      "docs/architecture.md",
      "docs/api-reference.md",
    ]) {
      const text = collapseWhitespace(read(path));
      expect(text).toContain("provider API key");
      expect(text).toContain("PEM");
      expect(text).toContain("bearer/JWT");
      expect(text).toContain("credentialed database URL");
    }

    for (const path of [
      "README.ko.md",
      "docs/architecture.ko.md",
      "docs/api-reference.ko.md",
    ]) {
      const text = collapseWhitespace(read(path));
      expect(text).toMatch(/provider API (?:key|키)/);
      expect(text).toContain("PEM");
      expect(text).toContain("bearer/JWT");
      expect(text).toContain("자격증명이 포함된 데이터베이스 URL");
    }

    const security = read("docs/security.md");
    for (const term of ["GCP", "Stripe", "Slack", "Database connection"]) {
      expect(security).toContain(term);
    }
    const securityKo = read("docs/security.ko.md");
    for (const term of ["GCP", "Stripe", "Slack", "DB 연결 문자열"]) {
      expect(securityKo).toContain(term);
    }
  });

  it("documents MEMORY_API_TOKENS colon restrictions", () => {
    const envExample = read(".env.example");
    const configuration = read("docs/configuration.md");
    const configurationKo = read("docs/configuration.ko.md");

    expect(envExample).toContain('Token values themselves must not contain ":"');
    expect(configuration).toContain("The token value itself must not contain `:`");
    expect(configuration).toContain(
      "rejects entries with more than one\ncolon at startup",
    );
    expect(configurationKo).toContain("토큰 값 자체에는 `:` 를 넣지 마세요");
    expect(configurationKo).toContain("`:` 가 두 개 이상인 entry는 시작 시");
  });

  it("documents rate-limit replica boundaries", () => {
    const compose = read("compose.yaml");
    const configuration = read("docs/configuration.md");
    const configurationKo = read("docs/configuration.ko.md");
    const security = read("docs/security.md");
    const securityKo = read("docs/security.ko.md");
    const deployment = read("docs/deployment.md");
    const deploymentKo = read("docs/deployment.ko.md");

    expect(compose).toContain(
      "RATE_LIMIT_PER_MINUTE: ${RATE_LIMIT_PER_MINUTE:-60}",
    );

    for (const text of [configuration, security, deployment]) {
      expect(text).toContain("in-memory");
      expect(text).toContain("process-local");
    }
    expect(configuration).toContain("each app replica has its own bucket");
    expect(configuration).toContain("deployment-wide quota");
    expect(configuration).toContain("NGINX `limit_req_zone`/`limit_req`");
    expect(configuration).toContain("Cloudflare rate limiting");
    expect(security).toContain("one bucket per app replica");
    expect(security).toContain("strict deployment-wide quota");
    expect(deployment).toContain("each replica has its own bucket");
    expect(deployment).toContain("shared reverse proxy or edge layer");

    for (const text of [configurationKo, securityKo, deploymentKo]) {
      expect(text).toContain("프로세스-local");
      expect(text).toContain("replica");
      expect(text).toContain("bucket");
    }
    expect(configurationKo).toContain("배포 전체 quota");
    expect(configurationKo).toContain("NGINX `limit_req_zone`/`limit_req`");
    expect(configurationKo).toContain("Cloudflare\nrate limiting rules");
    expect(securityKo).toContain("배포 전체의 엄격한 quota");
    expect(deploymentKo).toContain("edge 계층");
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

  it("keeps the bug report embedding-provider options aligned with supported providers", () => {
    expect(
      issueTemplateDropdownOptions(".github/ISSUE_TEMPLATE/bug_report.yml", "embedding-provider"),
    ).toEqual([
      "transformers",
      "openai",
      "local",
    ]);
  });

  it("keeps the bug report deployment options aligned with vector backends", () => {
    expect(
      issueTemplateDropdownOptions(".github/ISSUE_TEMPLATE/bug_report.yml", "deployment"),
    ).toContain("Custom (external Postgres / Qdrant or pgvector)");
  });

  it("keeps the feature request scope options aligned with vector backends", () => {
    expect(
      issueTemplateDropdownOptions(".github/ISSUE_TEMPLATE/feature_request.yml", "scope"),
    ).toContain("Vector backend (Qdrant / pgvector)");
  });

  it("keeps bug report security links rooted at the repository", () => {
    const template = read(".github/ISSUE_TEMPLATE/bug_report.yml");

    expect(template).not.toContain("](../SECURITY.md)");
    expect(snippetsAround(template, "[SECURITY.md]")).toHaveLength(2);
    for (const snippet of snippetsAround(template, "[SECURITY.md]")) {
      expect(snippet).toContain("[SECURITY.md](../../SECURITY.md)");
    }
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

  it("keeps compaction apply comments current in touched files", () => {
    const staleSignals = [
      {
        path: "src/app/server.ts",
        text: "trigger destructive operations once compaction-apply ships in P17",
      },
      {
        path: "tests/compact/compact-memory.test.ts",
        text: "archivedIds remains [] in this PR",
      },
      {
        path: "tests/compact/compact-memory.test.ts",
        text: "apply path lands in P17 step 3",
      },
      {
        path: "src/compact/compact-memory.ts",
        text: "apply-path code in P17 step 3 has a stable seam to extend",
      },
    ];

    for (const { path, text } of staleSignals) {
      expect(read(path)).not.toContain(text);
    }
  });

  it("keeps ingest sweeper repository comments current", () => {
    expect(read("src/jobs/ingest-job-repository.ts")).not.toContain(
      "The sweeper PR will",
    );
  });

  it("keeps public architecture data-flow docs free of internal phase labels", () => {
    for (const path of ["docs/architecture.md", "docs/architecture.ko.md"]) {
      const text = read(path);
      expect(text).not.toContain("(P17)");
      expect(text).not.toContain("(P19.1)");
      expect(text).not.toContain("pre-P19.1");
    }
  });

  it("keeps memory archive repository comments current", () => {
    const text = read("src/store/memory-archive-repository.ts");
    expect(text).not.toContain("P17 compaction");
    expect(text).not.toContain("P17 step 6");
    expect(text).not.toContain("P19.1 — unarchive recovery flow");
    expect(text).not.toContain("pre-P19.1 archive row");
  });

  it("keeps migration comments free of internal phase labels", () => {
    for (const path of [
      "src/db/migrations/004_add_cascade_indexes.sql",
      "src/db/migrations/005_add_compaction_archive.sql",
      "src/db/migrations/006_add_archive_unarchive.sql",
    ]) {
      const text = read(path);
      expect(text).not.toContain("P17");
      expect(text).not.toContain("P19.1");
    }
  });

  it("keeps compaction apply, sweeper, and MCP type comments current", () => {
    const envExample = read(".env.example");
    const applyCompaction = read("src/compact/apply-compaction.ts");
    const compactMemory = read("src/compact/compact-memory.ts");
    const mcpServerTest = read("tests/mcp/server.test.ts");
    const sweeperLoop = read("src/compact/sweeper-loop.ts");
    const mcpTypes = read("src/mcp/types.ts");

    expect(envExample).not.toContain("P17 compaction-apply");
    expect(applyCompaction).not.toContain("destructive P17 apply path");
    expect(applyCompaction).not.toContain("scoped out for P17");
    expect(applyCompaction).not.toContain("P17 step 6");
    expect(compactMemory).not.toContain("orchestrator (P18.1)");
    expect(mcpServerTest).not.toContain("semantic dedup (P18)");
    expect(sweeperLoop).not.toContain("P19 ships");
    expect(mcpTypes).not.toContain("P18: opt-in semantic dedup");
    expect(mcpTypes).not.toContain("P17: populated when dryRun=false");
    expect(mcpTypes).not.toContain("P19.1 — unarchive recovery flow");
  });

  it("documents descriptor-driven tool validation in API docs", () => {
    expect(read("docs/api-reference.md")).toContain("shared tool schema");
    expect(read("docs/api-reference.ko.md")).toContain("공유 tool schema");
    expect(read("docs/api-reference.md")).toContain("src/mcp/tool-handlers.ts");
    expect(read("docs/api-reference.ko.md")).toContain("src/mcp/tool-handlers.ts");
    expect(read("docs/api-reference.md")).toContain("src/audit/tool-handlers.ts");
    expect(read("docs/api-reference.ko.md")).toContain("src/audit/tool-handlers.ts");
    expect(read("docs/api-reference.md")).toContain("src/compact/tool-handlers.ts");
    expect(read("docs/api-reference.ko.md")).toContain("src/compact/tool-handlers.ts");
    expect(read("docs/api-reference.md")).toContain("src/store/tool-handlers.ts");
    expect(read("docs/api-reference.ko.md")).toContain("src/store/tool-handlers.ts");
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
      "instrument()`\nwrapper in `src/mcp/tool-registry-instrumentation.ts`",
    );
    expect(read("docs/architecture.ko.md")).toContain(
      "`src/mcp/tool-registry-instrumentation.ts` 의 `instrument()`",
    );
    expect(read("docs/architecture.md")).toContain("src/audit/tool-handlers.ts");
    expect(read("docs/architecture.ko.md")).toContain("src/audit/tool-handlers.ts");
    expect(read("docs/architecture.md")).toContain("src/compact/tool-handlers.ts");
    expect(read("docs/architecture.ko.md")).toContain("src/compact/tool-handlers.ts");
    expect(read("docs/architecture.md")).toContain("src/mcp/tool-repository-access.ts");
    expect(read("docs/architecture.ko.md")).toContain("src/mcp/tool-repository-access.ts");
    expect(read("docs/architecture.md")).toContain("src/store/tool-handlers.ts");
    expect(read("docs/architecture.ko.md")).toContain("src/store/tool-handlers.ts");
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

  it("keeps Unreleased changelog migration ranges current", () => {
    const range = currentMigrationRange();

    for (const path of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
      const unreleased = unreleasedChangelogSection(path);
      const ranges = migrationRanges(unreleased);
      expect(unreleased).toContain(range);
      expect(ranges).toEqual(expect.arrayContaining([range]));
      expect(ranges.filter((entry) => entry !== range)).toEqual([]);
    }
  });

  it("does not describe the Unreleased ingest outbox sweeper as still in flight", () => {
    const english = unreleasedChangelogBulletContaining(
      "CHANGELOG.md",
      "Migration 007: `ingest_jobs`",
    );
    const englishLower = english.toLowerCase();
    expect(english).toContain("INGEST_SWEEP_ENABLED");
    expect(english).toContain("src/compact/ingest-sweeper.ts");
    expect(english).toContain("src/compact/ingest-sweeper-loop.ts");
    expect(englishLower).not.toContain("#12 branch");
    expect(englishLower).not.toContain("in-flight");
    expect(englishLower).not.toContain("in-progress");

    const korean = unreleasedChangelogBulletContaining(
      "CHANGELOG.ko.md",
      "Migration 007: `ingest_jobs`",
    );
    expect(korean).toContain("INGEST_SWEEP_ENABLED");
    expect(korean).toContain("src/compact/ingest-sweeper.ts");
    expect(korean).toContain("src/compact/ingest-sweeper-loop.ts");
    expect(korean).not.toContain("#12 브랜치");
    expect(korean).not.toContain("진행 중");
    expect(korean).not.toContain("진행중");
  });

  it("records the npm package tarball surface fix in Unreleased changelogs", () => {
    const english = unreleasedChangelogBulletContaining(
      "CHANGELOG.md",
      "npm package tarball",
    );
    expect(english).toMatch(/built\s+runtime\s+output/);
    expect(english).toContain("source/tests/CI/internal");
    expect(english).toContain("source-checkout-only");
    expect(english).toContain("Docker/Compose");
    expect(english).toContain("`dist/`");
    expect(english).toMatch(/compiled\s+eval\s+harness/);
    expect(english).toContain("`prepack`");
    expect(english).toContain("clean `dist/`");
    expect(english).toContain("`install.sh`");

    const korean = unreleasedChangelogBulletContaining(
      "CHANGELOG.ko.md",
      "npm package tarball",
    );
    expect(korean).toMatch(/built\s+runtime\s+output/);
    expect(korean).toContain("source/tests/CI/internal");
    expect(korean).toContain("source-checkout-only");
    expect(korean).toContain("Docker/Compose");
    expect(korean).toContain("`dist/`");
    expect(korean).toMatch(/compiled\s+eval\s+harness/);
    expect(korean).toContain("`prepack`");
    expect(korean).toContain("clean `dist/`");
    expect(korean).toContain("`install.sh`");
  });

  it("records admin shell reliability fixes in Unreleased changelogs", () => {
    for (const path of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
      const bullet = unreleasedChangelogBulletContaining(path, "/admin/memory");
      expect(bullet).toContain("load/save/tag/archive");
      expect(bullet).toContain("status");
      expect(bullet).toContain("non-JSON");
      expect(bullet).toContain("HTTP status");
      expect(bullet).toContain("JSON `null`");
    }
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

  it("keeps the contract baseline aligned with public route sources", () => {
    const contracts = read("CONTRACTS.md");

    expect(contracts).toContain("src/mcp/tool-schemas.ts");
    expect(contracts).toContain("src/mcp/tool-registry.ts");
    expect(contracts).toContain("src/mcp/tool-registry-instrumentation.ts");
    expect(contracts).toContain("src/mcp/tool-repository-access.ts");
    expect(contracts).toContain("src/mcp/tool-handlers.ts");
    expect(contracts).toContain("src/audit/tool-handlers.ts");
    expect(contracts).toContain("src/compact/tool-handlers.ts");
    expect(contracts).toContain("src/goal-run/tool-handlers.ts");
    expect(contracts).toContain("src/store/tool-handlers.ts");
    expect(contracts).toContain("src/mcp/types.ts");
    expect(contracts).toContain("src/mcp/service-tools.ts");
    expect(contracts).toContain("src/mcp/context-tools.ts");
    expect(contracts).toContain("src/mcp/resources.ts");
    expect(contracts).toContain("src/mcp/prompts.ts");
    expect(contracts).toContain("src/mcp/tool-result.ts");
    expect(contracts).toContain("src/app/mcp-http.ts");
    expect(contracts).toContain("src/app/middleware/mcp-http-auth.ts");
    expect(contracts).toContain("src/app/routes/memory.ts");
    expect(contracts).toContain("src/app/routes/tool-handler.ts");
    expect(contracts).toContain("src/app/routes/types.ts");
    expect(contracts).toContain("src/app/middleware/json-body.ts");
    expect(contracts).toContain("src/app/middleware/organization-resolution.ts");
    expect(contracts).toContain("src/app/middleware/envelope.ts");
    expect(contracts).toContain("src/app/server.ts");
    expect(contracts).toContain("src/cli-args.ts");
    expect(contracts).toContain("src/cli.ts");
    expect(contracts).toContain("tests/app/envelope.test.ts");
    expect(contracts).toContain("tests/app/mcp-http.test.ts");
    expect(contracts).toContain("tests/cli.test.ts");
    expect(contracts).toContain("tests/audit/audit-write.test.ts");
    expect(contracts).toContain("structuredContent");
    expect(contracts).toContain("package.json");
    expect(contracts).toContain("001_initial.sql");
    expect(contracts).toContain("015_background_queue_metrics_indexes.sql");
    expect(contracts).toContain(`${TOOL_ROUTES.length} service tool`);

    for (const route of TOOL_ROUTES) {
      expect(contracts).toContain(`\`${route.name}\``);
      expect(contracts).toContain(`\`${route.path}\``);
    }

    for (const endpoint of [
      "/mcp",
      "/healthz",
      "/readyz",
      "/metrics",
      "/admin/memory",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      expect(contracts).toContain(endpoint);
    }
  });

  it("keeps the architecture transition plan resumable", () => {
    const plan = read("PLAN.md");

    for (const heading of [
      "## Current State",
      "## Next Loop Candidates",
      "## Target Architecture",
      "## Transition Plan",
      "## Contract Gate",
      "## Risks And Rollback",
      "## Continuation Handoff",
    ]) {
      expect(plan).toContain(heading);
    }

    for (const requiredContext of [
      "src/mcp/tool-schemas.ts",
      "src/mcp/types.ts",
      "src/app/routes/memory.ts",
      "CONTRACTS.md",
      "organizationId",
      "git status --short --branch",
      "git log -1 --oneline",
      "Do not push",
    ]) {
      expect(plan).toContain(requiredContext);
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
      if (path.endsWith(".ko.md")) {
        expect(text).toContain("논리 벡터 데이터가");
        expect(text).not.toContain("logical vector data lives in");
      } else {
        expect(text).toMatch(/logical vector data lives in\s+Postgres/);
      }
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
      if (path.endsWith(".ko.md")) {
        expect(text).toContain("논리 데이터 경로");
        expect(text).not.toContain("logical data path");
      } else {
        expect(text).toContain("logical data path");
      }
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

  it("describes Compose environment flow as variable substitution", () => {
    const envExample = read(".env.example");

    expect(envExample).toContain("Compose uses");
    expect(envExample).toContain("${VAR:-default} substitution");
    expect(envExample).toContain("the app reads process.env");
    expect(envExample).not.toContain("env_file substitution");
    expect(read("docs/configuration.md")).toContain(
      "docker compose substitution",
    );
    expect(read("docs/configuration.ko.md")).toContain("docker compose 치환");
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
