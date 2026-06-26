// MCP server tool surface types. Extracted from server.ts to keep that file
// focused on runtime wiring. server.ts re-exports these so external importers
// (cli.ts, tests, scripts) keep their existing import paths unchanged.

import type {
  AuditLogRepository,
  AuditOutcome,
  StoredAuditLogEntry,
} from "../audit/audit-log-repository.js";
import type { ServiceConfig } from "../config.js";
import type {
  ContextPackSelectionRationale,
  ContextPackSections,
} from "../context-pack/build-context-pack.js";
import type { Logger } from "../logger.js";
import type {
  CanonicalMemoryRepository,
  Durability,
  IngestJobRepository,
  MemoryType,
  MemoryRepository,
  ScopeType,
  SearchMemoryResult,
} from "../types.js";
import type {
  EmbeddingClient,
  MemoryChunkRepository,
} from "../store/canonical-indexing.js";
import type { VectorIndex } from "../vector/vector-index.js";
import type { MemoryArchiveRepository } from "../store/memory-archive-repository.js";
import type { ToolName } from "./tool-schemas.js";

export type MaybePromise<T> = T | Promise<T>;

export type AddMemoryToolInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
  kind: string;
  content: string;
};

export type AddMemoryToolResult = {
  ok: true;
  memoryId: string;
  summary: string;
};

export type SearchMemoryToolInput = {
  organizationId?: string;
  projectKey: string;
  query: string;
  userScopeId?: string;
  includeUser?: boolean;
  limit?: number;
};

export type SearchMemoryToolResult = {
  ok: true;
  projectKey: string;
  query: string;
  results: SearchMemoryResult[];
};

export type BuildContextPackToolInput = {
  organizationId?: string;
  projectKey: string;
  task: string;
  userScopeId?: string;
  includeUser?: boolean;
  limit?: number;
};

export type BuildContextPackToolResult = {
  ok: true;
  projectKey: string;
  packMarkdown: string;
  selectedMemoryIds: string[];
  sections: ContextPackSections;
  selectionRationale: ContextPackSelectionRationale[];
};

export type ReindexMemoryToolInput = {
  organizationId?: string;
  projectKey: string;
  userScopeId?: string;
};

export type ReindexMemoryToolResult = {
  ok: true;
  projectKey: string;
  scopes: string[];
  chunkCount: number;
};

export type CompactMemoryToolInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
  dryRun?: boolean;
  limit?: number;
  // v2 additions for the dry-run plan output.
  decayThreshold?: number;
  halfLifeDays?: number;
  // P18: opt-in semantic dedup (paraphrases via cosine). When set,
  // REPLACES exact-match dedup. Recommended 0.95 for paraphrases.
  // Threshold ∈ (0, 1]. Out: groups appear in CompactMemoryToolResult.
  // duplicateGroups identical to the exact-match path.
  semanticDedupThreshold?: number;
};

export type DuplicateGroupView = {
  keepId: string;
  archiveIds: string[];
};

export type DecayCandidateView = {
  id: string;
  score: number;
};

export type CompactionApplyStats = {
  archived: number;
  skipped: number;
  qdrantPointsDeleted: number;
  qdrantPointsPending: number;
  durationMs: number;
};

export type CompactMemoryToolResult = {
  ok: true;
  projectKey: string;
  dryRun: boolean;
  archivedIds: string[];
  mergedIds: string[];
  promotionCandidates: string[];
  duplicateGroups: DuplicateGroupView[];
  decayCandidates: DecayCandidateView[];
  summary: string;
  // P17: populated when dryRun=false. compactionRunId is the server-generated
  // UUID idempotency key; applyStats summarizes the destructive run.
  compactionRunId?: string;
  applyStats?: CompactionApplyStats;
};

export type CompactMemoryToolInput_v2Extension = {
  // Records below this decay score are flagged for eviction (default 0.5).
  decayThreshold?: number;
  // Half-life in days for the decay curve (default 30).
  halfLifeDays?: number;
};

export type ListMemoryToolInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
  includeArchived?: boolean;
  tag?: string;
  limit?: number;
};

export type ListMemoryToolResult = {
  ok: true;
  scopeType: ScopeType;
  scopeId: string;
  memories: SearchMemoryResult[];
};

export type UpdateMemoryToolInput = {
  organizationId?: string;
  memoryId: number;
  kind?: MemoryType;
  title?: string | null;
  content?: string;
  summary?: string | null;
  importance?: number;
  durability?: Durability;
  tags?: string[];
};

export type UpdateMemoryToolResult = {
  ok: true;
  updated: boolean;
  memory?: SearchMemoryResult;
};

export type DeleteMemoryToolInput = {
  organizationId?: string;
  memoryId: number;
};

export type DeleteMemoryToolResult = {
  ok: true;
  archived: boolean;
  qdrantPointsDeleted: number;
  qdrantPointsPending: number;
};

export type TagMemoryToolInput = {
  organizationId?: string;
  memoryId: number;
  tags: string[];
};

export type TagMemoryToolResult = {
  ok: true;
  updated: boolean;
  memory?: SearchMemoryResult;
};

export type ListAuditLogToolInput = {
  organizationId?: string;
  limit?: number;
};

export type AuditLogEntryView = {
  id: number;
  organizationId: string;
  actor: string;
  tool: string;
  projectKey: string | null;
  outcome: AuditOutcome;
  errorMessage: string | null;
  durationMs: number;
  requestId: string | null;
  createdAt: string;
};

export type ListAuditLogToolResult = {
  ok: true;
  organizationId: string;
  entries: AuditLogEntryView[];
};

// P19.1 — unarchive recovery flow.
export type UnarchiveMemoryToolInput = {
  organizationId?: string;
  archiveIds: number[];
};

export type UnarchiveOutcomeView =
  | {
      archiveId: number;
      status: "restored";
      restoredRecordId: number;
      sourceRecordId: number;
      chunkCount: number;
    }
  | { archiveId: number; status: "skipped"; reason: string }
  | { archiveId: number; status: "failed"; error: string };

export type UnarchiveMemoryToolResult = {
  ok: true;
  outcomes: UnarchiveOutcomeView[];
  restoredCount: number;
  skippedCount: number;
  failedCount: number;
};

export type WorkspaceRootView = {
  uri: string;
  name?: string;
};

export type ListWorkspaceRootsToolInput = {
  organizationId?: string;
};

export type ListWorkspaceRootsToolResult = {
  ok: true;
  supported: boolean;
  roots: WorkspaceRootView[];
  message?: string;
};

export type AddMemoryInteractiveToolInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
  kind?: string;
  message?: string;
};

export type AddMemoryInteractiveToolResult = {
  ok: true;
  action: "accept" | "decline" | "cancel" | "unsupported";
  stored: boolean;
  memoryId?: string;
  summary?: string;
  collected?: {
    projectKey?: string;
    kind?: string;
    content?: string;
  };
  message?: string;
};

export type ClassifyMemoryCandidateToolInput = {
  organizationId?: string;
  content: string;
  instruction?: string;
  maxTokens?: number;
};

export type MemoryClassificationView = {
  kind: string;
  summary: string;
  confidence?: number;
};

export type ClassifyMemoryCandidateToolResult = {
  ok: true;
  supported: boolean;
  classification?: MemoryClassificationView;
  model?: string;
  rawText?: string;
  message?: string;
};

export type McpToolAuthorizationInput = {
  toolName: ToolName;
  input: Record<string, unknown>;
};

export type McpToolAuthorizer = (
  input: McpToolAuthorizationInput,
) => MaybePromise<void>;

// Internal alias — kept as a structural-equivalence point so ToolRegistry stays
// decoupled from the concrete StoredAuditLogEntry shape over time.
export type _AuditLogEntryRef = StoredAuditLogEntry;

export type ToolRegistry = {
  add_memory(input: AddMemoryToolInput): Promise<AddMemoryToolResult>;
  search_memory(input: SearchMemoryToolInput): Promise<SearchMemoryToolResult>;
  build_context_pack(
    input: BuildContextPackToolInput,
  ): Promise<BuildContextPackToolResult>;
  reindex_memory(
    input: ReindexMemoryToolInput,
  ): Promise<ReindexMemoryToolResult>;
  compact_memory(input: CompactMemoryToolInput): Promise<CompactMemoryToolResult>;
  list_memory(input: ListMemoryToolInput): Promise<ListMemoryToolResult>;
  update_memory(input: UpdateMemoryToolInput): Promise<UpdateMemoryToolResult>;
  delete_memory(input: DeleteMemoryToolInput): Promise<DeleteMemoryToolResult>;
  tag_memory(input: TagMemoryToolInput): Promise<TagMemoryToolResult>;
  list_audit_log(
    input: ListAuditLogToolInput,
  ): Promise<ListAuditLogToolResult>;
  unarchive_memory(
    input: UnarchiveMemoryToolInput,
  ): Promise<UnarchiveMemoryToolResult>;
};

export type RetrieveMemoryServiceInput = {
  organizationId?: string;
  projectKey: string;
  userScopeId?: string;
  query: string;
  limit: number;
};

export type RetrieveMemoryService = (
  input: RetrieveMemoryServiceInput,
) => Promise<SearchMemoryResult[]>;

export type CreateToolRegistryOptions = {
  cwd?: string;
  repository?: MemoryRepository;
  projectRepository?: MemoryRepository;
  userRepository?: MemoryRepository;
  resolveRepository?: (projectKey: string) => MemoryRepository;
  resolveCanonicalServices?: () => MaybePromise<CanonicalServices>;
  withCanonicalServices?: WithCanonicalServices;
  defaultUserScopeId?: string;
  retrieveMemory?: RetrieveMemoryService;
  logger?: Logger;
  // When provided, every tool invocation writes an audit row (best-effort —
  // failures are swallowed so audit infra outages never break user operations).
  auditLog?: AuditLogRepository;
  // Identifies the caller (typically derived from bearer token mapping or
  // git email). Defaults to "anonymous" when missing.
  defaultActor?: string;
};

export type CreateMcpServerOptions = CreateToolRegistryOptions & {
  registry?: ToolRegistry;
  authorizeTool?: McpToolAuthorizer;
};

export type CanonicalServices = {
  config: {
    qdrant: Pick<ServiceConfig["qdrant"], "collectionName">;
    embedding: ServiceConfig["embedding"];
  };
  repository: CanonicalMemoryRepository;
  chunkRepository: MemoryChunkRepository;
  ingestJobs: IngestJobRepository;
  auditLog: AuditLogRepository;
  archiveRepository: MemoryArchiveRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  close?: () => MaybePromise<void>;
};

export type WithCanonicalServices = <T>(
  callback: (services: CanonicalServices) => Promise<T>,
) => Promise<T>;
