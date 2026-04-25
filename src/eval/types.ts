// Shared eval-harness types. Decoupled from any storage backend so fixtures
// can map their own seed keys onto whatever record ids the seed pass produces.

export type EvalScope = {
  projectKey?: string;
  userScopeId?: string;
};

// `relevantRecordSeedKeys` references the seed-key of fixture records, not
// their database ids (which are not known until insert). The eval runner is
// responsible for translating seed keys to record ids after seeding.
export type EvalQuery = {
  id: string;
  query: string;
  relevantRecordSeedKeys: string[];
  scope: EvalScope;
};

export type MetricSummary = {
  totalQueries: number;
  recallAt10: number;
  mrrAt10: number;
};
