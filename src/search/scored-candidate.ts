import type { SearchMemoryResult } from "../types.js";

export type CandidateSource = "vector" | "lexical";

export type RetrievedMemoryCandidate = {
  record: SearchMemoryResult;
  source: CandidateSource;
  scores: {
    vector?: number;
    lexical?: number;
    scope: number;
    metadata: number;
    recency: number;
    total: number;
  };
  reasons: string[];
};
