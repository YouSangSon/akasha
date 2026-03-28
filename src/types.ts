export type ScopeType = "user" | "project";

export type ScopeRef = {
  scopeType: ScopeType;
  scopeId: string;
};

export type MemoryType = "decision" | "fact" | "summary";

export type SourceType = "decision" | "document" | "conversation";

export type MemorySourceInput = ScopeRef & {
  sourceType: SourceType;
  externalId: string;
  title?: string;
  uri?: string;
};

export type AddMemoryInput = ScopeRef & {
  source: MemorySourceInput;
  memoryType: MemoryType;
  content: string;
};

export type SearchMemoryInput = {
  query: string;
  scopes: ScopeRef[];
  limit?: number;
};

export type MemorySource = ScopeRef & {
  id: number;
  sourceType: SourceType;
  externalId: string;
  title: string | null;
  uri: string | null;
  createdAt: string;
};

export type MemoryRecord = ScopeRef & {
  id: number;
  sourceId: number;
  memoryType: MemoryType;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchMemoryResult = MemoryRecord & {
  source: MemorySource;
};

export type MemoryRepository = {
  addMemory(input: AddMemoryInput): SearchMemoryResult;
  searchMemory(input: SearchMemoryInput): SearchMemoryResult[];
};
