# Postgres + Qdrant Memory Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SQLite-first local memory loop with a self-hosted Postgres + Qdrant memory service that supports project/user recall, vector retrieval, SSH-tunneled operator access, and backup/restore tooling.

**Architecture:** The deployed system runs on one VPS with Docker Compose. Postgres becomes the source of truth for memory records, chunks, relationships, and ingest jobs; Qdrant becomes the retrieval index for chunk vectors and payload filters; the Node/TypeScript app owns ingestion, indexing, ranking, MCP/CLI contracts, and operator workflows.

**Tech Stack:** TypeScript, Node.js, `pg`, `@qdrant/js-client-rest`, `openai`, `@modelcontextprotocol/sdk`, `zod`, Docker Compose, PostgreSQL, Qdrant, `vitest`, `tsx`

---

## Official references

- PostgreSQL backup and restore: the PostgreSQL documentation covers logical backups with `pg_dump` and restore with `pg_restore` / `psql`.
- Qdrant installation and snapshots: the Qdrant documentation covers Docker installation and snapshot-based backup/restore.
- OpenAI embeddings: the official OpenAI Node SDK supports `text-embedding-3-small`.
- MCP TypeScript SDK: the `modelcontextprotocol/typescript-sdk` repository is the official TypeScript SDK for MCP servers and clients.

## Planned file structure

- Modify: `package.json` - replace SQLite-era scripts and dependencies with Postgres/Qdrant/OpenAI tooling
- Modify: `src/config.ts` - service env parsing, loopback binding, SSH-tunnel-aware operator config
- Modify: `src/types.ts` - canonical Postgres/Qdrant memory types and ingest job types
- Create: `compose.yaml` - self-hosted single-VPS topology
- Create: `docker/app.Dockerfile` - app container image
- Create: `.env.example` - required runtime variables
- Modify: `src/db/connection.ts` - PostgreSQL pool bootstrap
- Modify: `src/db/migrate.ts` - SQL migration runner for PostgreSQL
- Create: `src/db/migrations/001_initial.sql` - canonical Postgres schema
- Modify: `src/store/memory-repository.ts` - Postgres-backed source/memory/chunk persistence
- Create: `src/jobs/ingest-job-repository.ts` - ingest job lifecycle persistence
- Create: `src/chunk/chunk-text.ts` - fixed chunking policy implementation
- Create: `src/embedding/openai-embeddings.ts` - embedding provider wrapper
- Create: `src/qdrant/client.ts` - Qdrant collection bootstrap and point upserts
- Create: `src/qdrant/point-mapper.ts` - memory chunk -> Qdrant point mapping
- Create: `src/search/retrieve-memory.ts` - Qdrant retrieval + Postgres hydrate + final reranking
- Modify: `src/search/rank-results.ts` - final precedence and retrieval scoring
- Modify: `src/context-pack/build-context-pack.ts` - context packs from hydrated Postgres records
- Modify: `src/compact/compact-memory.ts` - compaction against Postgres canonical records
- Modify: `src/mcp/server.ts` - Postgres/Qdrant-backed tool registry
- Modify: `src/cli.ts` - operator commands for pack/reindex/backup-verify/restore-smoke
- Create: `src/app/server.ts` - private operator HTTP service bound to loopback
- Create: `scripts/backup-postgres.sh` - nightly logical backup
- Create: `scripts/snapshot-qdrant.sh` - Qdrant snapshot capture
- Create: `scripts/backup-verify.ts` - verify local + off-box artifacts and manifests
- Create: `scripts/restore-smoke.ts` - isolated restore validation
- Create: `docs/self-hosted-operations.md` - deployment and recovery runbook
- Create: `tests/config/service-config.test.ts`
- Modify: `tests/db/migrate.test.ts`
- Modify: `tests/store/memory-repository.test.ts`
- Create: `tests/jobs/ingest-job-repository.test.ts`
- Create: `tests/chunk/chunk-text.test.ts`
- Create: `tests/embedding/openai-embeddings.test.ts`
- Create: `tests/qdrant/point-mapper.test.ts`
- Create: `tests/search/retrieve-memory.test.ts`
- Modify: `tests/context-pack/build-context-pack.test.ts`
- Modify: `tests/mcp/server.test.ts`
- Modify: `tests/cli.test.ts`
- Create: `tests/scripts/backup-verify.test.ts`
- Create: `tests/scripts/restore-smoke.test.ts`
- Create: `tests/manual/m1-restore-drill-checklist.md`

## Scope note

This plan keeps the current SQLite-era files compiling until parity is proven. Removal of legacy-only code happens in the last task after the Postgres/Qdrant path is green.

Execution note: the user later explicitly required that SQLite no longer be part of the active runtime. When that requirement conflicts with the staged cleanup order, Task 8 acceptance work must be pulled forward into the same branch before merge. In that case, do not ship the cleanup on partial confidence; require full `npm test && npm run typecheck && npm run build` verification plus container-path deployment checks.

### Task 1: Replace runtime configuration and deployment scaffolding

**Files:**
- Create: `compose.yaml`
- Create: `docker/app.Dockerfile`
- Create: `.env.example`
- Modify: `package.json`
- Modify: `src/config.ts`
- Test: `tests/config/service-config.test.ts`

- [ ] **Step 1: Write the failing config and deployment test**

```ts
// tests/config/service-config.test.ts
import { describe, expect, it } from "vitest";
import { resolveServiceConfig } from "../../src/config.js";

describe("resolveServiceConfig", () => {
  it("parses Postgres, Qdrant, OpenAI, and backup settings", () => {
    const config = resolveServiceConfig({
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8787",
        DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
        BACKUP_DIR: "/var/lib/developer-memory-os/backups",
        BACKUP_TARGET_HOST: "backup@example.internal",
      },
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.databaseUrl).toContain("postgres://memory:memory");
    expect(config.qdrant.url).toBe("http://qdrant:6333");
    expect(config.embedding.model).toBe("text-embedding-3-small");
    expect(config.backups.targetHost).toBe("backup@example.internal");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/config/service-config.test.ts`  
Expected: FAIL with `Cannot find export 'resolveServiceConfig'` or an equivalent missing-config error from `src/config.ts`

- [ ] **Step 3: Write the minimal runtime config and deployment scaffold**

```ts
// src/config.ts
import path from "node:path";

export type ResolveServiceConfigInput = {
  env?: NodeJS.ProcessEnv;
};

export type ServiceConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  qdrant: {
    url: string;
    apiKey: string;
    collectionName: string;
  };
  embedding: {
    provider: "openai";
    model: "text-embedding-3-small";
    dimensions: 1536;
    version: "v1";
    chunkTargetTokens: 800;
    chunkOverlapTokens: 120;
  };
  backups: {
    directory: string;
    targetHost: string;
  };
};

export function resolveServiceConfig(
  input: ResolveServiceConfigInput = {},
): ServiceConfig {
  const env = input.env ?? process.env;
  const host = env.HOST ?? "127.0.0.1";
  const port = Number(env.PORT ?? "8787");
  const databaseUrl = requireEnv(env.DATABASE_URL, "DATABASE_URL");
  const qdrantUrl = requireEnv(env.QDRANT_URL, "QDRANT_URL");
  const qdrantApiKey = requireEnv(env.QDRANT_API_KEY, "QDRANT_API_KEY");
  const openAiApiKey = requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY");
  void openAiApiKey;

  return {
    host,
    port,
    databaseUrl,
    qdrant: {
      url: qdrantUrl,
      apiKey: qdrantApiKey,
      collectionName: env.QDRANT_COLLECTION_NAME ?? "memory_chunks_v1",
    },
    embedding: {
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      version: "v1",
      chunkTargetTokens: 800,
      chunkOverlapTokens: 120,
    },
    backups: {
      directory:
        env.BACKUP_DIR ??
        path.join(process.cwd(), ".developer-memory-os", "backups"),
      targetHost: requireEnv(env.BACKUP_TARGET_HOST, "BACKUP_TARGET_HOST"),
    },
  };
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
```

```yaml
# compose.yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: memory
      POSTGRES_PASSWORD: memory
      POSTGRES_DB: memory_os
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U memory -d memory_os"]
      interval: 10s
      timeout: 5s
      retries: 10

  qdrant:
    image: qdrant/qdrant:v1.13.2
    restart: unless-stopped
    environment:
      QDRANT__SERVICE__API_KEY: ${QDRANT_API_KEY}
    volumes:
      - qdrant_storage:/qdrant/storage

  app:
    build:
      context: .
      dockerfile: docker/app.Dockerfile
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    ports:
      - "127.0.0.1:8787:8787"

volumes:
  postgres_data:
  qdrant_storage:
```

```dockerfile
# docker/app.Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev:server"]
```

```json
// package.json (scripts/dependencies excerpt)
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:server": "tsx src/app/server.ts",
    "dev:mcp": "tsx src/mcp/server.ts",
    "dev:cli": "tsx src/cli.ts",
    "db:migrate": "tsx src/db/migrate.ts",
    "backup:verify": "tsx scripts/backup-verify.ts",
    "restore:smoke": "tsx scripts/restore-smoke.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@qdrant/js-client-rest": "^1.13.0",
    "openai": "^4.0.0",
    "pg": "^8.0.0",
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 4: Run the config test and typecheck**

Run: `npm test -- tests/config/service-config.test.ts && npm run typecheck`  
Expected: PASS for the config test and `tsc` exits with code 0

- [ ] **Step 5: Commit the deployment scaffold**

```bash
git add compose.yaml docker/app.Dockerfile .env.example package.json src/config.ts tests/config/service-config.test.ts
git commit -m "build: add postgres qdrant service scaffold"
```

### Task 2: Add the PostgreSQL schema and migration runner

**Files:**
- Modify: `src/db/connection.ts`
- Modify: `src/db/migrate.ts`
- Create: `src/db/migrations/001_initial.sql`
- Modify: `tests/db/migrate.test.ts`

- [ ] **Step 1: Write the failing PostgreSQL migration test**

```ts
// tests/db/migrate.test.ts
import { describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";

describe("runMigrations", () => {
  it("creates canonical Postgres tables for memory state", async () => {
    const pool = createPgPool({
      connectionString:
        "postgres://memory:memory@127.0.0.1:5432/memory_os_test",
    });

    await runMigrations(pool);

    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'sources',
          'memory_records',
          'memory_chunks',
          'relationships',
          'context_pack_runs',
          'ingest_jobs'
        )
      ORDER BY table_name
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "context_pack_runs",
      "ingest_jobs",
      "memory_chunks",
      "memory_records",
      "relationships",
      "sources",
    ]);

    await pool.end();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose up -d postgres && npm test -- tests/db/migrate.test.ts`  
Expected: FAIL because `createPgPool` does not exist or the expected tables are missing

- [ ] **Step 3: Write the minimal Postgres bootstrap and migration runner**

```ts
// src/db/connection.ts
import { Pool } from "pg";

export type CreatePgPoolInput = {
  connectionString: string;
};

export function createPgPool(input: CreatePgPoolInput): Pool {
  return new Pool({
    connectionString: input.connectionString,
    max: 10,
  });
}
```

```sql
-- src/db/migrations/001_initial.sql
CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_records (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  project_key TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  durability TEXT NOT NULL DEFAULT 'ephemeral',
  importance INTEGER NOT NULL DEFAULT 0,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id BIGSERIAL PRIMARY KEY,
  memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  embedding_version TEXT NOT NULL,
  qdrant_point_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (memory_record_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS relationships (
  id BIGSERIAL PRIMARY KEY,
  from_memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  to_memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS context_pack_runs (
  id BIGSERIAL PRIMARY KEY,
  project_key TEXT NOT NULL,
  task TEXT NOT NULL,
  selected_memory_ids JSONB NOT NULL,
  pack_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id BIGSERIAL PRIMARY KEY,
  memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```ts
// src/db/migrate.ts
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationPath = path.join(migrationsDir, "001_initial.sql");
  const sql = await fs.readFile(migrationPath, "utf8");
  await pool.query(sql);
}
```

- [ ] **Step 4: Run the migration test**

Run: `docker compose up -d postgres && npm test -- tests/db/migrate.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the Postgres schema**

```bash
git add src/db/connection.ts src/db/migrate.ts src/db/migrations/001_initial.sql tests/db/migrate.test.ts
git commit -m "feat: add postgres schema and migration runner"
```

### Task 3: Move canonical persistence into Postgres

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store/memory-repository.ts`
- Create: `src/jobs/ingest-job-repository.ts`
- Modify: `tests/store/memory-repository.test.ts`
- Create: `tests/jobs/ingest-job-repository.test.ts`

- [ ] **Step 1: Write the failing repository tests**

```ts
// tests/store/memory-repository.test.ts
import { describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

describe("createMemoryRepository", () => {
  it("stores project and user memories in canonical Postgres tables", async () => {
    const pool = createPgPool({
      connectionString:
        "postgres://memory:memory@127.0.0.1:5432/memory_os_test",
    });
    await runMigrations(pool);
    const repository = createMemoryRepository(pool);

    const created = await repository.addMemory({
      scopeType: "user",
      scopeId: "alice",
      projectKey: "project-alpha",
      memoryType: "decision",
      title: "Response language",
      content: "Always respond in Korean unless the repo says otherwise.",
      source: {
        scopeType: "user",
        scopeId: "alice",
        sourceType: "conversation",
        sourceRef: "manual://session",
        title: "Manual note",
      },
      durability: "durable",
      importance: 5,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.scopeType).toBe("user");
    expect(created.source.sourceRef).toBe("manual://session");

    await pool.end();
  });
});
```

```ts
// tests/jobs/ingest-job-repository.test.ts
import { describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";

describe("createIngestJobRepository", () => {
  it("creates and completes ingest jobs", async () => {
    const pool = createPgPool({
      connectionString:
        "postgres://memory:memory@127.0.0.1:5432/memory_os_test",
    });
    await runMigrations(pool);
    const jobs = createIngestJobRepository(pool);

    const job = await jobs.create({ memoryRecordId: 101 });
    expect(job.status).toBe("pending");

    const completed = await jobs.markCompleted(job.id);
    expect(completed.status).toBe("completed");

    await pool.end();
  });
});
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run: `npm test -- tests/store/memory-repository.test.ts tests/jobs/ingest-job-repository.test.ts`  
Expected: FAIL because the repository is still SQLite-oriented and `createIngestJobRepository` does not exist

- [ ] **Step 3: Write the minimal Postgres repositories**

```ts
// src/types.ts (excerpt)
export type Durability = "ephemeral" | "durable" | "archived";

export type SourceType = "decision" | "document" | "conversation";

export type MemorySourceInput = {
  scopeType: "user" | "project";
  scopeId: string;
  sourceType: SourceType;
  sourceRef: string;
  title?: string;
};

export type AddMemoryInput = {
  scopeType: "user" | "project";
  scopeId: string;
  projectKey?: string;
  memoryType: "decision" | "fact" | "summary";
  title?: string;
  content: string;
  source: MemorySourceInput;
  durability: Durability;
  importance: number;
};
```

```ts
// src/store/memory-repository.ts
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { AddMemoryInput } from "../types.js";

export function createMemoryRepository(pool: Pool) {
  return {
    async addMemory(input: AddMemoryInput) {
      const sourceResult = await pool.query(
        `
          INSERT INTO sources (
            scope_type,
            scope_id,
            source_type,
            source_ref,
            title,
            content_hash
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, scope_type, scope_id, source_type, source_ref, title, captured_at
        `,
        [
          input.source.scopeType,
          input.source.scopeId,
          input.source.sourceType,
          input.source.sourceRef,
          input.source.title ?? null,
          createHash("sha256").update(input.content).digest("hex"),
        ],
      );

      const memoryResult = await pool.query(
        `
          INSERT INTO memory_records (
            scope_type,
            scope_id,
            project_key,
            kind,
            title,
            content,
            summary,
            durability,
            importance,
            source_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, scope_type, scope_id, project_key, kind, title, content, summary, durability, importance, created_at, updated_at
        `,
        [
          input.scopeType,
          input.scopeId,
          input.projectKey ?? null,
          input.memoryType,
          input.title ?? null,
          input.content,
          input.content.slice(0, 180),
          input.durability,
          input.importance,
          sourceResult.rows[0].id,
        ],
      );

      return {
        ...mapMemory(memoryResult.rows[0]),
        source: mapSource(sourceResult.rows[0]),
      };
    },
  };
}
```

```ts
// src/jobs/ingest-job-repository.ts
import type { Pool } from "pg";

export function createIngestJobRepository(pool: Pool) {
  return {
    async create(input: { memoryRecordId: number }) {
      const result = await pool.query(
        `
          INSERT INTO ingest_jobs (memory_record_id, status)
          VALUES ($1, 'pending')
          RETURNING id, memory_record_id, status, attempts, last_error, created_at, updated_at
        `,
        [input.memoryRecordId],
      );

      return mapJob(result.rows[0]);
    },

    async markCompleted(jobId: number) {
      const result = await pool.query(
        `
          UPDATE ingest_jobs
          SET status = 'completed',
              updated_at = NOW()
          WHERE id = $1
          RETURNING id, memory_record_id, status, attempts, last_error, created_at, updated_at
        `,
        [jobId],
      );

      return mapJob(result.rows[0]);
    },
  };
}
```

- [ ] **Step 4: Run the Postgres repository tests**

Run: `npm test -- tests/store/memory-repository.test.ts tests/jobs/ingest-job-repository.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the canonical repository layer**

```bash
git add src/types.ts src/store/memory-repository.ts src/jobs/ingest-job-repository.ts tests/store/memory-repository.test.ts tests/jobs/ingest-job-repository.test.ts
git commit -m "feat: move canonical memory state into postgres"
```

### Task 4: Add chunking, embeddings, and Qdrant indexing

**Files:**
- Create: `src/chunk/chunk-text.ts`
- Create: `src/embedding/openai-embeddings.ts`
- Create: `src/qdrant/client.ts`
- Create: `src/qdrant/point-mapper.ts`
- Create: `tests/chunk/chunk-text.test.ts`
- Create: `tests/embedding/openai-embeddings.test.ts`
- Create: `tests/qdrant/point-mapper.test.ts`

- [ ] **Step 1: Write the failing chunking and point-mapping tests**

```ts
// tests/chunk/chunk-text.test.ts
import { describe, expect, it } from "vitest";
import { chunkText } from "../../src/chunk/chunk-text.js";

describe("chunkText", () => {
  it("creates deterministic overlapping chunks with offsets", () => {
    const text = "alpha ".repeat(400);
    const chunks = chunkText({
      text,
      targetTokens: 800,
      overlapTokens: 120,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[1]?.startOffset).toBeLessThan(chunks[0]!.endOffset);
  });
});
```

```ts
// tests/qdrant/point-mapper.test.ts
import { describe, expect, it } from "vitest";
import { toQdrantPoint } from "../../src/qdrant/point-mapper.js";

describe("toQdrantPoint", () => {
  it("maps a memory chunk to a scoped qdrant point", () => {
    const point = toQdrantPoint({
      chunk: {
        id: 15,
        memoryRecordId: 9,
        chunkIndex: 0,
        content: "Always respond in Korean unless the repo says otherwise.",
        embeddingVersion: "v1",
      },
      record: {
        id: 9,
        scopeType: "user",
        scopeId: "alice",
        projectKey: "project-alpha",
        durability: "durable",
        kind: "decision",
        tags: ["style"],
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      embedding: [0.1, 0.2, 0.3],
    });

    expect(point.id).toBe("chunk:15");
    expect(point.payload.scope_type).toBe("user");
    expect(point.payload.project_key).toBe("project-alpha");
    expect(point.vector).toEqual([0.1, 0.2, 0.3]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/chunk/chunk-text.test.ts tests/qdrant/point-mapper.test.ts`  
Expected: FAIL because the chunking and Qdrant mapping modules do not exist

- [ ] **Step 3: Write the minimal chunker, embeddings wrapper, and Qdrant client**

```ts
// src/chunk/chunk-text.ts
export type TextChunk = {
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
};

export function chunkText(input: {
  text: string;
  targetTokens: number;
  overlapTokens: number;
}): TextChunk[] {
  const words = input.text.trim().split(/\s+/);
  const step = input.targetTokens - input.overlapTokens;
  const chunks: TextChunk[] = [];

  for (let start = 0, index = 0; start < words.length; start += step, index += 1) {
    const end = Math.min(words.length, start + input.targetTokens);
    const content = words.slice(start, end).join(" ");
    const startOffset = input.text.indexOf(words[start] ?? "");
    const endOffset = startOffset + content.length;

    chunks.push({
      chunkIndex: index,
      content,
      startOffset,
      endOffset,
    });

    if (end === words.length) {
      break;
    }
  }

  return chunks;
}
```

```ts
// src/embedding/openai-embeddings.ts
import OpenAI from "openai";

export function createOpenAiEmbeddingClient(input: {
  apiKey: string;
  model: "text-embedding-3-small";
}) {
  const client = new OpenAI({ apiKey: input.apiKey });

  return {
    async embed(inputText: string): Promise<number[]> {
      const response = await client.embeddings.create({
        model: input.model,
        input: inputText,
      });

      return response.data[0]?.embedding ?? [];
    },
  };
}
```

```ts
// src/qdrant/client.ts
import { QdrantClient } from "@qdrant/js-client-rest";

export function createQdrantClient(input: {
  url: string;
  apiKey: string;
}) {
  return new QdrantClient({
    url: input.url,
    apiKey: input.apiKey,
  });
}
```

```ts
// src/qdrant/point-mapper.ts
export function toQdrantPoint(input: {
  chunk: {
    id: number;
    memoryRecordId: number;
    chunkIndex: number;
    content: string;
    embeddingVersion: string;
  };
  record: {
    id: number;
    scopeType: "user" | "project";
    scopeId: string;
    projectKey: string | null;
    durability: string;
    kind: string;
    tags: string[];
    updatedAt: string;
  };
  embedding: number[];
}) {
  return {
    id: `chunk:${input.chunk.id}`,
    vector: input.embedding,
    payload: {
      chunk_id: input.chunk.id,
      memory_record_id: input.record.id,
      scope_type: input.record.scopeType,
      scope_id: input.record.scopeId,
      project_key: input.record.projectKey,
      kind: input.record.kind,
      durability: input.record.durability,
      tags: input.record.tags,
      updated_at: input.record.updatedAt,
      embedding_version: input.chunk.embeddingVersion,
    },
  };
}
```

- [ ] **Step 4: Run the chunking and mapping tests**

Run: `npm test -- tests/chunk/chunk-text.test.ts tests/qdrant/point-mapper.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the indexing primitives**

```bash
git add src/chunk/chunk-text.ts src/embedding/openai-embeddings.ts src/qdrant/client.ts src/qdrant/point-mapper.ts tests/chunk/chunk-text.test.ts tests/embedding/openai-embeddings.test.ts tests/qdrant/point-mapper.test.ts
git commit -m "feat: add qdrant indexing primitives"
```

### Task 5: Build the retrieval pipeline and context-pack assembly

**Files:**
- Create: `src/search/retrieve-memory.ts`
- Modify: `src/search/rank-results.ts`
- Modify: `src/context-pack/build-context-pack.ts`
- Create: `tests/search/retrieve-memory.test.ts`
- Modify: `tests/context-pack/build-context-pack.test.ts`

- [ ] **Step 1: Write the failing retrieval test**

```ts
// tests/search/retrieve-memory.test.ts
import { describe, expect, it, vi } from "vitest";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";

describe("retrieveMemory", () => {
  it("hydrates qdrant hits from postgres and keeps project results ahead of user results", async () => {
    const qdrant = {
      query: vi.fn().mockResolvedValue({
        points: [
          { payload: { memory_record_id: 12 } },
          { payload: { memory_record_id: 21 } },
        ],
      }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 21,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Use ripgrep first.",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: { sourceType: "document", title: "Tooling" },
        },
        {
          id: 12,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "decision",
          content: "Decision: keep project memory ahead of user memory.",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: { sourceType: "decision", title: "ADR 2" },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 5,
    });

    expect(results.map((result) => result.id)).toEqual([12, 21]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/search/retrieve-memory.test.ts`  
Expected: FAIL because `retrieveMemory` does not exist

- [ ] **Step 3: Write the minimal retrieval pipeline**

```ts
// src/search/retrieve-memory.ts
import { rankResults } from "./rank-results.js";

export async function retrieveMemory(input: {
  qdrantClient: {
    query: (args: unknown) => Promise<{
      points: Array<{ payload?: { memory_record_id?: number } }>;
    }>;
  };
  repository: {
    getMemoryRecordsByIds: (ids: number[]) => Promise<unknown[]>;
  };
  collectionName: string;
  vector: number[];
  projectKey: string;
  userScopeId: string;
  limit: number;
}) {
  const response = await input.qdrantClient.query({
    collection_name: input.collectionName,
    query: input.vector,
    limit: input.limit,
    filter: {
      should: [
        {
          must: [
            { key: "scope_type", match: { value: "project" } },
            { key: "project_key", match: { value: input.projectKey } },
          ],
        },
        {
          must: [
            { key: "scope_type", match: { value: "user" } },
            { key: "scope_id", match: { value: input.userScopeId } },
          ],
        },
      ],
    },
  });

  const ids = response.points
    .map((point) => point.payload?.memory_record_id)
    .filter((id): id is number => typeof id === "number");

  const records = await input.repository.getMemoryRecordsByIds(ids);
  return rankResults(records as never[]);
}
```

- [ ] **Step 4: Run the retrieval and context-pack tests**

Run: `npm test -- tests/search/retrieve-memory.test.ts tests/context-pack/build-context-pack.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the retrieval pipeline**

```bash
git add src/search/retrieve-memory.ts src/search/rank-results.ts src/context-pack/build-context-pack.ts tests/search/retrieve-memory.test.ts tests/context-pack/build-context-pack.test.ts
git commit -m "feat: add qdrant retrieval pipeline"
```

### Task 6: Rebuild the MCP, CLI, and private app service around Postgres + Qdrant

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/cli.ts`
- Create: `src/app/server.ts`
- Modify: `tests/mcp/server.test.ts`
- Modify: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing interface tests**

```ts
// tests/cli.test.ts
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("parses operator maintenance commands", () => {
    expect(
      parseCliArgs(["reindex", "--project", "project-alpha", "--user", "alice"]),
    ).toEqual({
      command: "reindex",
      projectKey: "project-alpha",
      userScopeId: "alice",
    });
  });
});
```

```ts
// tests/mcp/server.test.ts
import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "../../src/mcp/server.js";

describe("createToolRegistry", () => {
  it("builds context packs from the retrieve-memory service", async () => {
    const retrieveMemory = vi.fn().mockResolvedValue([
      {
        id: 12,
        scopeType: "project",
        scopeId: "project-alpha",
        memoryType: "decision",
        content: "Decision: keep project memory ahead of user memory.",
        updatedAt: "2026-03-29T00:00:00.000Z",
        source: { sourceType: "decision", title: "ADR 2" },
      },
    ]);

    const registry = createToolRegistry({
      retrieveMemory,
    } as never);

    const result = await registry.build_context_pack({
      projectKey: "project-alpha",
      userScopeId: "alice",
      task: "continue work",
    });

    expect(result.selectedMemoryIds).toEqual([
      "project:project-alpha:12",
    ]);
  });
});
```

- [ ] **Step 2: Run the interface tests to verify they fail**

Run: `npm test -- tests/mcp/server.test.ts tests/cli.test.ts`  
Expected: FAIL because the new commands and retrieval-based registry do not exist

- [ ] **Step 3: Write the minimal MCP, CLI, and server integration**

```ts
// src/cli.ts (excerpt)
export type ParsedCliArgs =
  | { command: "pack"; projectKey: string; userScopeId?: string; task: string }
  | { command: "reindex"; projectKey: string; userScopeId?: string }
  | { command: "backup-verify" }
  | { command: "restore-smoke" };
```

```ts
// src/app/server.ts
import http from "node:http";
import { resolveServiceConfig } from "../config.js";

export function createOperatorServer() {
  const config = resolveServiceConfig();

  return http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, host: config.host, port: config.port }));
      return;
    }

    response.writeHead(404);
    response.end();
  });
}
```

```ts
// src/mcp/server.ts (registry excerpt)
const records = await retrieveMemory({
  qdrantClient,
  repository,
  collectionName: config.qdrant.collectionName,
  vector,
  projectKey: input.projectKey,
  userScopeId: input.userScopeId ?? resolvedUserScopeId,
  limit: input.limit ?? 10,
});
```

- [ ] **Step 4: Run the interface tests**

Run: `npm test -- tests/mcp/server.test.ts tests/cli.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the operator interfaces**

```bash
git add src/mcp/server.ts src/cli.ts src/app/server.ts tests/mcp/server.test.ts tests/cli.test.ts
git commit -m "feat: rebuild operator interfaces for postgres qdrant"
```

### Task 7: Add backup verification, restore smoke, and deployment operations

**Files:**
- Create: `scripts/backup-postgres.sh`
- Create: `scripts/snapshot-qdrant.sh`
- Create: `scripts/backup-verify.ts`
- Create: `scripts/restore-smoke.ts`
- Create: `docs/self-hosted-operations.md`
- Create: `tests/scripts/backup-verify.test.ts`
- Create: `tests/scripts/restore-smoke.test.ts`
- Create: `tests/manual/m1-restore-drill-checklist.md`

- [ ] **Step 1: Write the failing operations tests**

```ts
// tests/scripts/backup-verify.test.ts
import { describe, expect, it } from "vitest";
import { verifyBackups } from "../../scripts/backup-verify.js";

describe("verifyBackups", () => {
  it("fails when the newest snapshot is older than 24 hours", async () => {
    await expect(
      verifyBackups({
        now: new Date("2026-03-30T00:00:00.000Z"),
        latestBackupAt: new Date("2026-03-28T00:00:00.000Z"),
        localArtifactsPresent: true,
        remoteArtifactsPresent: true,
        checksumsMatch: true,
      }),
    ).rejects.toThrow("latest successful backup is older than 24 hours");
  });
});
```

```ts
// tests/scripts/restore-smoke.test.ts
import { describe, expect, it, vi } from "vitest";
import { runRestoreSmoke } from "../../scripts/restore-smoke.js";

describe("runRestoreSmoke", () => {
  it("restores Postgres and Qdrant, then checks one search and one context pack", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const callSearch = vi.fn().mockResolvedValue([{ id: 12 }]);
    const callPack = vi.fn().mockResolvedValue({ ok: true });

    await runRestoreSmoke({
      exec,
      callSearch,
      callPack,
    });

    expect(exec).toHaveBeenCalled();
    expect(callSearch).toHaveBeenCalledTimes(1);
    expect(callPack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the operations tests to verify they fail**

Run: `npm test -- tests/scripts/backup-verify.test.ts tests/scripts/restore-smoke.test.ts`  
Expected: FAIL because the scripts do not exist

- [ ] **Step 3: Write the minimal backup and restore tooling**

```bash
#!/usr/bin/env sh
# scripts/backup-postgres.sh
set -eu

timestamp="$(date +%Y%m%d-%H%M)"
mkdir -p "${BACKUP_DIR}"
pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_DIR}/postgres-${timestamp}.sql.gz"
sha256sum "${BACKUP_DIR}/postgres-${timestamp}.sql.gz" > "${BACKUP_DIR}/postgres-${timestamp}.sha256"
```

```ts
// scripts/backup-verify.ts
export async function verifyBackups(input: {
  now: Date;
  latestBackupAt: Date;
  localArtifactsPresent: boolean;
  remoteArtifactsPresent: boolean;
  checksumsMatch: boolean;
}) {
  const ageMs = input.now.getTime() - input.latestBackupAt.getTime();
  const maxAgeMs = 24 * 60 * 60 * 1000;

  if (!input.localArtifactsPresent) {
    throw new Error("latest local backup artifacts are missing");
  }

  if (!input.remoteArtifactsPresent) {
    throw new Error("latest off-box backup artifacts are missing");
  }

  if (!input.checksumsMatch) {
    throw new Error("backup checksums do not match");
  }

  if (ageMs > maxAgeMs) {
    throw new Error("latest successful backup is older than 24 hours");
  }
}
```

```ts
// scripts/restore-smoke.ts
export async function runRestoreSmoke(input: {
  exec: (command: string, args: string[]) => Promise<void>;
  callSearch: () => Promise<unknown[]>;
  callPack: () => Promise<{ ok: boolean }>;
}) {
  await input.exec("docker", ["compose", "-p", "restore-smoke", "up", "-d"]);
  const searchResults = await input.callSearch();

  if (searchResults.length === 0) {
    throw new Error("restore smoke search returned no results");
  }

  const packResult = await input.callPack();

  if (!packResult.ok) {
    throw new Error("restore smoke context pack failed");
  }
}
```

- [ ] **Step 4: Run the operations tests**

Run: `npm test -- tests/scripts/backup-verify.test.ts tests/scripts/restore-smoke.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the operational tooling**

```bash
git add scripts/backup-postgres.sh scripts/snapshot-qdrant.sh scripts/backup-verify.ts scripts/restore-smoke.ts docs/self-hosted-operations.md tests/scripts/backup-verify.test.ts tests/scripts/restore-smoke.test.ts tests/manual/m1-restore-drill-checklist.md
git commit -m "feat: add backup and restore tooling"
```

### Task 8: Remove SQLite-era assumptions and verify the deployed foundation

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/migrate.ts`
- Modify: `docs/superpowers/specs/2026-03-28-developer-memory-os-design.md`
- Modify: `README.md`
- Modify: `tests/manual/m1-restore-drill-checklist.md`

- [ ] **Step 1: Write the failing regression test for built CLI startup**

```ts
// tests/cli.test.ts (additional case)
it("runs the built CLI against postgres and qdrant without sqlite assets", async () => {
  const output = await runBuiltCli([
    "pack",
    "--project",
    "project-alpha",
    "--user",
    "alice",
    "--task",
    "continue work",
  ]);

  expect(output).toContain("# Context Pack");
});
```

- [ ] **Step 2: Run the full suite to expose legacy SQLite dependencies**

Run: `npm test && npm run typecheck && npm run build`  
Expected: FAIL until remaining SQLite-only assumptions are removed

- [ ] **Step 3: Remove SQLite-only artifacts and update docs**

```md
<!-- docs/superpowers/specs/2026-03-28-developer-memory-os-design.md -->
This document remains the historical SQLite-first MVP record only. The active deployment design is `2026-03-29-postgres-qdrant-memory-service-design.md`.
```

```ts
// src/db/migrate.ts (final cleanup rule)
// Remove the embedded SQLite schema fallback once Postgres migration loading is the only path.
```

```md
<!-- README.md excerpt -->
## Self-hosted milestone 1

Run the stack:

```bash
cp .env.example .env
docker compose up -d postgres qdrant
npm run db:migrate
npm run dev:server
```

Verify backups and restore:

```bash
npm run backup:verify
npm run restore:smoke
```
```

- [ ] **Step 4: Run the final verification commands**

Run: `npm test && npm run typecheck && npm run build && docker compose up -d postgres qdrant && node dist/src/cli.js pack --project project-alpha --user alice --task "continue work"`  
Expected: PASS for all commands and the built CLI prints a context pack

- [ ] **Step 5: Commit the Postgres + Qdrant milestone foundation**

```bash
git add README.md docs/superpowers/specs/2026-03-28-developer-memory-os-design.md src tests
git commit -m "feat: ship postgres qdrant memory service foundation"
```

## Self-review

### Spec coverage

- Deployment topology: covered by Tasks 1 and 7
- Operator-only SSH-tunneled access: covered by Tasks 1 and 6
- Postgres source of truth: covered by Tasks 2 and 3
- Qdrant retrieval index: covered by Tasks 4 and 5
- Fixed embedding contract: covered by Task 4
- Backup verify / restore smoke / reindex commands: covered by Tasks 6 and 7
- Final removal of SQLite-era assumptions: covered by Task 8

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” steps remain in the tasks
- Every task names exact files, commands, and test targets

### Type consistency

- `resolveServiceConfig`, `createPgPool`, `createMemoryRepository`, `createIngestJobRepository`, `chunkText`, `createOpenAiEmbeddingClient`, `toQdrantPoint`, `retrieveMemory`, `verifyBackups`, and `runRestoreSmoke` are defined before later tasks rely on them

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-29-postgres-qdrant-memory-service.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
