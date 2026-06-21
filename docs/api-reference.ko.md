> [English](api-reference.md) | **한국어**

# API 레퍼런스

Akasha는 동일한 도구 surface를 두 가지 transport로 노출합니다:

- **MCP** (stdio) — Claude Code, Codex CLI 같은 AI 클라이언트용.
  진입점: `dist/src/cli.js`. 7개 도구 모두 등록됨.
- **HTTP** (POST JSON) — 그 외 모든 클라이언트용.
  진입점: `src/app/server.ts`, 기본 바인드 `127.0.0.1:8787`.

두 transport 모두 `src/mcp/server.ts` 의 같은 핸들러 함수를 호출합니다.
도구 입출력은 동일하고 wire 포맷만 다릅니다.

## 인증 (HTTP 전용)

모든 `/v1/*` 라우트는 bearer 토큰이 필요합니다. `/healthz`, `/readyz` 는
인증 없음.

```bash
curl -H "Authorization: Bearer dev-token" http://localhost:8787/v1/memory/search ...
```

실패 케이스:

| 상태 | 이유 |
|---|---|
| 401 | `Authorization` 헤더 누락 / 알 수 없음 / 잘못된 형식 |
| 403 | 토큰이 다른 org에 바인딩됨 (body / 헤더와 불일치) |
| 429 | 토큰별 rate limit 소진 |
| 503 | `/readyz` 가 의존성 outage 감지 (probe가 주입된 경우에만 — 아래 health 섹션 참조) |

## 응답 envelope (HTTP)

모든 HTTP 응답은 일관된 envelope을 사용합니다:

```ts
// 성공:
{ "success": true,  "data": <ToolResult> }

// 실패:
{ "success": false, "error": { "message": "<사람이 읽을 메시지>" } }
```

MCP 응답은 SDK 네이티브 shape을 사용 — envelope 없음.

## 도구

### add_memory — 메모리 저장

```ts
type AddMemoryInput = {
  organizationId?: string;       // 토큰 바인딩이 있으면 덮어씀
  projectKey?: string;           // project scope 시 필수
  scope?: "project" | "user";    // 기본 "project"
  userScopeId?: string;          // user scope 시 필수
  kind: string;                  // "decision" | "fact" | "constraint" | …
  content: string;               // 자유 텍스트; 쓰기 시 secret-scrub 적용
};

type AddMemoryResult = {
  ok: true;
  memoryId: string;              // "project:<key>:<id>" 또는 "user:<scopeId>:<id>"
  summary: string;
};
```

HTTP: `POST /v1/memory`

```bash
curl -X POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "my-project",
    "kind": "decision",
    "content": "We decided to use Postgres for canonical persistence"
  }'
```

에러: 컨텐츠에 스크럽 패턴 (API key, PEM 블록, bearer 토큰, JWT) 포함 시
`SecretDetectedError` (400).

---

### search_memory — 시맨틱 + scope 필터링 검색

```ts
type SearchMemoryInput = {
  organizationId?: string;
  projectKey: string;            // 필수
  query: string;
  userScopeId?: string;          // user-scope 결과 포함
  includeUser?: boolean;         // 기본 true; false로 설정 시 user-scope 결과 제외
  limit?: number;                // 기본 10
};

type SearchMemoryResult = {
  ok: true;
  projectKey: string;
  query: string;
  results: Array<{
    id: number;
    scopeType: "project" | "user";
    scopeId: string;
    memoryType: string;
    content: string;
    importance: number;
    createdAt: string;
    score: number;
    // ... 전체 record shape
  }>;
};
```

HTTP: `POST /v1/memory/search`

동작: 쿼리 임베딩 → Qdrant 코사인 검색 (org + scope 필터) → top-K를
Postgres에서 hydrate → 랭킹 → 반환. 동점인 경우 project-scope 결과가
user-scope 결과보다 안정적으로 앞에 옴.

---

### build_context_pack — 세션 priming용 팩 생성

```ts
type BuildContextPackInput = {
  organizationId?: string;
  projectKey: string;
  task: string;                  // 필수; 랭킹용 작업 설명
  userScopeId?: string;
  includeUser?: boolean;         // 기본 true; false로 설정 시 user-scope 결과 제외
  limit?: number;
};

type BuildContextPackResult = {
  ok: true;
  projectKey: string;
  packMarkdown: string;          // 새 세션에 붙여넣을 준비된 텍스트
  selectedMemoryIds: string[];
  sections: {
    project_summary: SearchMemoryResult[];
    recent_decisions: SearchMemoryResult[];
    constraints: SearchMemoryResult[];
    open_questions: SearchMemoryResult[];
    relevant_notes: SearchMemoryResult[];
  };
};
```

HTTP: `POST /v1/memory/context-pack`

`packMarkdown` 은 task 라인이 맨 아래 (구분자 뒤) 에 렌더링됩니다 — 안정적인
body가 LLM 프롬프트의 cache-eligible prefix에 위치하도록.

---

### reindex_memory — Postgres chunks에서 Qdrant 포인트 재구축

```ts
type ReindexMemoryInput = {
  organizationId: string;        // 필수; 없으면 throw (데이터 격리 가드)
  projectKey: string;            // 필수
  userScopeId?: string;
};

type ReindexMemoryResult = {
  ok: true;
  projectKey: string;
  scopes: string[];              // 예: ["project:my-project", "user:abc123"]
  chunkCount: number;
};
```

HTTP: `POST /v1/memory/reindex`
MCP stdio: `reindex_memory`

기존 chunk의 임베딩을 재계산해서 Qdrant에 upsert. `EMBEDDING_PROVIDER` 또는
`OPENAI_EMBEDDING_MODEL` 변경 후 사용.

---

### compact_memory — 중복 + decay (기본 dry-run)

```ts
type CompactMemoryInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: "project" | "user";
  userScopeId?: string;
  dryRun?: boolean;              // 기본 true; STRICT boolean 체크
  limit?: number;
  decayThreshold?: number;       // 기본 0.5
  halfLifeDays?: number;         // 기본 30
  semanticDedupThreshold?: number; // (0, 1]; 설정 시 exact-match 대체
};

type CompactMemoryResult = {
  ok: true;
  projectKey: string;
  dryRun: boolean;
  archivedIds: string[];         // dry-run 시 비어있음
  duplicateGroups: Array<{ keepId: string; archiveIds: string[] }>;
  decayCandidates: Array<{ id: string; score: number }>;
  promotionCandidates: string[];
  summary: string;
  // dryRun=false 일 때:
  compactionRunId?: string;
  applyStats?: {
    archived: number;
    skipped: number;
    qdrantPointsDeleted: number;
    qdrantPointsPending: number;
    durationMs: number;
  };
};
```

HTTP: `POST /v1/memory/compact`
MCP stdio: `compact_memory`

`dryRun=false` 시 apply 경로 실행:
1. 계획은 dry-run과 동일한 로직으로 계산.
2. 레코드별: PG CTE가 archive + 삭제 (TOCTOU 가드), Qdrant 삭제.
3. 실패는 레코드별 격리; 부분 실패는 `qdrantPointsPending` 카운터에
   반영되어 sweeper가 처리.

Idempotent: 같은 UUID로 replay 시 prior outcome 반환 (재실행하지 않음).
기본 org당 1회/시간으로 rate-limit; 한도 초과 시 HTTP **429** + `Retry-After` 헤더 반환.

---

### unarchive_memory — `memory_archive` 에서 복원

```ts
type UnarchiveMemoryInput = {
  organizationId?: string;
  archiveIds: number[];
};

type UnarchiveMemoryResult = {
  ok: true;
  outcomes: Array<
    | { archiveId: number; status: "restored"; restoredRecordId: number; sourceRecordId: number; chunkCount: number }
    | { archiveId: number; status: "skipped"; reason: string }
    | { archiveId: number; status: "failed"; error: string }
  >;
  restoredCount: number;
  skippedCount: number;
  failedCount: number;
};
```

HTTP: `POST /v1/memory/unarchive`
MCP stdio: `unarchive_memory`

Skip 사유:
- `archive_not_found_or_org_mismatch` — id 없음 또는 org 범위 밖
- `already_unarchived` — `unarchived_at` 이미 set (idempotent)
- `pre_p19.1_archive_missing_source_id` — source_id 캡처 이전 archive;
  manual recovery 필요

복원된 레코드는 새 BIGSERIAL id를 받으며, 응답의 `sourceRecordId` 가 원래
id와 매핑 — 호출자는 이걸로 레퍼런스 업데이트.

---

### list_audit_log — 감사 로그 읽기

```ts
type ListAuditLogInput = {
  organizationId?: string;
  limit?: number;                // 기본 100
};

type ListAuditLogResult = {
  ok: true;
  organizationId: string;
  entries: Array<{
    id: string;
    organizationId: string;
    actor: string;
    tool: string;
    projectKey: string | null;
    outcome: "ok" | "error";
    errorMessage: string | null;
    durationMs: number;
    requestId: string | null;
    createdAt: string;
  }>;
};
```

HTTP: `POST /v1/audit/list`

읽기 전용. 토큰 바인딩으로 org-scope; 다른 org의 entry는 누출되지 않음.

---

## Health probe (HTTP 전용)

### `GET /healthz` — liveness

인증 없음. 프로세스가 살아 있으면 항상 200. 의존성 체크 없음.

### `GET /readyz` — readiness

인증 없음. 실제 의존성을 프로브하며 다음을 반환합니다:

- **200** — 모든 프로브 통과 시 (각 상태 포함)
- **503** — 의존성 하나라도 연결 불가 시 (load balancer drain 또는 Kubernetes
  readiness 실패)

내장 프로덕션 서버(`startOperatorServer`)는 다음 프로브를 자동으로 연결합니다:

| 프로브 | 검사 내용 | 항상 활성? |
|---|---|---|
| `postgres` | `SELECT 1` | 예 |
| `qdrant` | Qdrant 호스트 `GET /healthz` | 예 |
| `openai` | API 키로 `GET /v1/models` | `EMBEDDING_PROVIDER=openai` 일 때만 |

OpenAI 프로브는 `transformers` 및 `local` 프로바이더에서는 생략됩니다 — 해당
배포에는 API 키가 없어 readiness 실패를 일으켜서는 안 됩니다.

Kubernetes readiness probe, Docker `HEALTHCHECK`, 외부 업타임 모니터에 사용하세요.
`/healthz` 엔드포인트는 의존성 체크 없이 프로세스 생존만 확인하는 liveness
체크로 유지됩니다.
