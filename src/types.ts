import type { EntityKind } from "./entities/entity-extraction.js";

export type ScopeType = "user" | "project";

export type ScopeRef = {
  scopeType: ScopeType;
  scopeId: string;
};

export type Durability = "ephemeral" | "durable" | "archived";

export type MemoryType = "decision" | "fact" | "summary";

export type SourceType = "decision" | "document" | "conversation";

export type MemorySourceInput = ScopeRef & {
  sourceType: SourceType;
  sourceRef?: string;
  externalId?: string;
  title?: string;
  uri?: string;
};

export type AddMemoryInput = ScopeRef & {
  source: MemorySourceInput;
  // Organization tag for multi-tenancy (e.g. "dev-team", "finance-team").
  // Defaults to "default" downstream if omitted, preserving single-tenant behavior.
  organizationId?: string;
  projectKey?: string;
  memoryType: MemoryType;
  title?: string;
  content: string;
  summary?: string;
  durability?: Durability;
  importance?: number;
};

export type SearchMemoryInput = {
  query: string;
  scopes: ScopeRef[];
  // Limit results to a single organization. Omitted = no org filter (legacy
  // single-tenant). Tools should pass this through from caller input.
  organizationId?: string;
  limit?: number;
};

export type MemorySource = ScopeRef & {
  id: number;
  // organizationId is always populated for records read from the canonical
  // store (defaults to 'default' for legacy rows). Marked optional only so
  // ad-hoc fixtures and in-memory test repositories don't have to spell it.
  organizationId?: string;
  sourceType: SourceType;
  externalId?: string;
  sourceRef?: string;
  title: string | null;
  uri: string | null;
  createdAt: string;
};

export type MemoryRecord = ScopeRef & {
  id: number;
  // See note on MemorySource.organizationId above.
  organizationId?: string;
  sourceId: number;
  projectKey?: string | null;
  memoryType: MemoryType;
  title?: string | null;
  content: string;
  summary?: string | null;
  durability?: Durability;
  importance?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type SearchMemoryResult = MemoryRecord & {
  source: MemorySource;
};

export type MemoryGraphEntityRef = {
  id: number;
  kind: EntityKind;
  normalized: string;
  displayText: string;
};

export type MemoryGraphEntity = MemoryGraphEntityRef & {
  organizationId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  mentionCount: number;
  memoryIds: number[];
};

export type MemoryGraphRelationship = {
  id: number;
  organizationId?: string;
  fromEntityId: number;
  toEntityId: number;
  fromEntity: MemoryGraphEntityRef;
  toEntity: MemoryGraphEntityRef;
  relationType: "co_mentions" | "temporal_context" | string;
  evidenceMemoryRecordId: number;
  validFrom: string | null;
  validTo: string | null;
  confidence: number;
  createdAt: string;
};

export type MemoryGraphView = {
  entities: MemoryGraphEntity[];
  relationships: MemoryGraphRelationship[];
};

export type ListMemoryOptions = {
  limit?: number;
  // When set, restrict listing to a single organization. Repositories that
  // honor this option only return records whose organization_id matches.
  organizationId?: string;
  // Escape hatch for documented legacy single-tenant behavior. When
  // organizationId is undefined and this flag is not set, listMemory throws —
  // silent cross-org reads are a footgun once a second tenant is added.
  // Production wiring sets this from LEGACY_ANONYMOUS_SEARCH=true only when
  // the operator explicitly opts in.
  allowLegacyAnonymous?: boolean;
  // Compaction pin. When true, records linked to a goal_run that is still
  // 'active' are excluded from the result. Used only by the compaction
  // candidate load so an in-progress goal never loses context to dedup or
  // decay-archive; list_memory (review) leaves this unset and still sees them.
  excludePinnedGoalRuns?: boolean;
};

export type MemoryRepository = {
  addMemory(input: AddMemoryInput): SearchMemoryResult;
  searchMemory(input: SearchMemoryInput): SearchMemoryResult[];
  listMemory(scope: ScopeRef, options?: ListMemoryOptions): SearchMemoryResult[];
  getMemoryRecordsByIds(
    ids: number[],
    organizationId?: string,
    allowLegacyAnonymous?: boolean,
  ): SearchMemoryResult[];
};

export type CanonicalMemoryRepository = {
  addMemory(input: AddMemoryInput): Promise<SearchMemoryResult>;
  searchMemory(input: SearchMemoryInput): Promise<SearchMemoryResult[]>;
  listMemory(
    scope: ScopeRef,
    options?: ListMemoryOptions,
  ): Promise<SearchMemoryResult[]>;
  // organizationId scopes the WHERE clause. When organizationId is undefined
  // and allowLegacyAnonymous is not set, throws — silent cross-org reads are
  // too easy a footgun once a second tenant is added. Pass
  // allowLegacyAnonymous: true (wired from LEGACY_ANONYMOUS_SEARCH=true) to
  // restore the historical org-blind behavior.
  getMemoryRecordsByIds(
    ids: number[],
    organizationId?: string,
    allowLegacyAnonymous?: boolean,
  ): Promise<SearchMemoryResult[]>;
  listMemoryForGovernance(
    scope: ScopeRef,
    options: {
      organizationId: string;
      includeArchived?: boolean;
      tag?: string;
      limit?: number;
    },
  ): Promise<SearchMemoryResult[]>;
  inspectMemoryGraph(
    scope: ScopeRef,
    options: {
      organizationId: string;
      kind?: EntityKind;
      query?: string;
      includeArchived?: boolean;
      limit?: number;
      relationshipLimit?: number;
    },
  ): Promise<MemoryGraphView>;
  updateMemoryRecord(input: {
    id: number;
    organizationId: string;
    kind?: MemoryType;
    title?: string | null;
    content?: string;
    summary?: string | null;
    importance?: number;
    durability?: Durability;
    tags?: string[];
  }): Promise<SearchMemoryResult | null>;
  archiveMemoryRecord(input: {
    id: number;
    organizationId: string;
  }): Promise<{ archived: boolean; qdrantPointIds: string[] }>;
  getMemoryRecordById(
    id: number,
    organizationId: string,
  ): Promise<SearchMemoryResult | null>;
  // Hard-deletes a memory_records row by id scoped to the given organization.
  // The organization_id guard prevents cross-tenant deletion in the event of
  // id collision. Schema-level ON DELETE CASCADE (memory_chunks, ingest_jobs,
  // relationships) handles dependents atomically in the same statement. Used
  // by writeCanonicalMemory's rollback path when post-INSERT side effects
  // (embed / Qdrant upsert) fail — without this, failed writes leave
  // permanently dead PG state behind.
  deleteMemoryRecord(id: number, organizationId: string): Promise<void>;
};

export type IngestJobStatus = "pending" | "processing" | "completed" | "failed";

export type IngestJobQdrantStatus = "pending" | "completed" | "failed";

export type IngestJob = {
  id: number;
  memoryRecordId: number;
  organizationId: string;
  status: IngestJobStatus;
  attempts: number;
  lastError: string | null;
  qdrantStatus: IngestJobQdrantStatus;
  qdrantAttempts: number;
  qdrantNextRetryAt: string | null;
  qdrantLastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IngestJobRepository = {
  create(input: { memoryRecordId: number; organizationId: string }): Promise<IngestJob>;
  markCompleted(jobId: number): Promise<IngestJob>;
  markFailed(jobId: number, error: unknown): Promise<IngestJob>;
  markQdrantCompleted(jobId: number): Promise<IngestJob>;
  markQdrantPending(input: {
    jobId: number;
    attempts: number;
    nextRetryAt: Date;
    error?: unknown;
  }): Promise<IngestJob>;
  markQdrantFailed(input: {
    jobId: number;
    attempts: number;
    error: unknown;
  }): Promise<IngestJob>;
  listPendingForRetry(input: { limit: number; now: Date }): Promise<IngestJob[]>;
  // Atomically claim rows due for retry by nulling qdrant_next_retry_at in the
  // same UPDATE that holds the FOR UPDATE SKIP LOCKED, preventing concurrent
  // sweeper replicas from re-claiming the same row.
  claimPendingForRetry(input: {
    limit: number;
    now: Date;
  }): Promise<IngestJob[]>;
};

export type GoalRunScopeType = "project" | "user";

export type GoalRunStatus = "active" | "completed" | "abandoned";

export type GoalRunIterationOutcome = "success" | "failure" | "partial";

export type GoalRun = {
  id: number;
  organizationId: string;
  scopeType: GoalRunScopeType;
  scopeId: string;
  projectKey: string | null;
  goal: string;
  terminationCriteria: string | null;
  status: GoalRunStatus;
  iterationCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type GoalRunIteration = {
  id: number;
  goalRunId: number;
  organizationId: string;
  iterationIndex: number;
  attempt: string;
  outcome: GoalRunIterationOutcome;
  summary: string | null;
  error: string | null;
  createdAt: string;
};

export type GoalRunWithIterations = GoalRun & {
  iterations: GoalRunIteration[];
};

export type StartGoalRunInput = {
  organizationId: string;
  scopeType: GoalRunScopeType;
  scopeId: string;
  projectKey?: string | null;
  goal: string;
  terminationCriteria?: string | null;
};

export type RecordIterationInput = {
  organizationId: string;
  goalRunId: number;
  attempt: string;
  outcome: GoalRunIterationOutcome;
  summary?: string | null;
  error?: string | null;
  memoryIds?: number[];
};

export type ListGoalRunsInput = {
  organizationId: string;
  scopeType: GoalRunScopeType;
  scopeId: string;
  status?: GoalRunStatus;
};

export type CloseGoalRunInput = {
  organizationId: string;
  goalRunId: number;
  note?: string | null;
};

export type GoalRunRepository = {
  start(input: StartGoalRunInput): Promise<GoalRun>;
  recordIteration(input: RecordIterationInput): Promise<GoalRunIteration>;
  get(input: {
    organizationId: string;
    goalRunId: number;
  }): Promise<GoalRunWithIterations | null>;
  list(input: ListGoalRunsInput): Promise<GoalRun[]>;
  complete(input: CloseGoalRunInput): Promise<GoalRun>;
  abandon(input: CloseGoalRunInput): Promise<GoalRun>;
};
