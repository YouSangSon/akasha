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
  createdAt: string;
  updatedAt: string;
};

export type SearchMemoryResult = MemoryRecord & {
  source: MemorySource;
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
  create(input: { memoryRecordId: number }): Promise<IngestJob>;
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
