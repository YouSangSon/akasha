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
  limit?: number;
};

export type MemorySource = ScopeRef & {
  id: number;
  sourceType: SourceType;
  externalId?: string;
  sourceRef?: string;
  title: string | null;
  uri: string | null;
  createdAt: string;
};

export type MemoryRecord = ScopeRef & {
  id: number;
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

export type MemoryRepository = {
  addMemory(input: AddMemoryInput): SearchMemoryResult;
  searchMemory(input: SearchMemoryInput): SearchMemoryResult[];
  listMemory(scope: ScopeRef): SearchMemoryResult[];
};

export type CanonicalMemoryRepository = {
  addMemory(input: AddMemoryInput): Promise<SearchMemoryResult>;
  searchMemory(input: SearchMemoryInput): Promise<SearchMemoryResult[]>;
  listMemory(scope: ScopeRef): Promise<SearchMemoryResult[]>;
};

export type IngestJobStatus = "pending" | "processing" | "completed" | "failed";

export type IngestJob = {
  id: number;
  memoryRecordId: number;
  status: IngestJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IngestJobRepository = {
  create(input: { memoryRecordId: number }): Promise<IngestJob>;
  markCompleted(jobId: number): Promise<IngestJob>;
};
