import type { AddMemoryInput, ScopeRef } from "../types.js";
import type { EvalQuery, EvalScope } from "./types.js";

type SeedScope = { seedKey: string; memory: Pick<AddMemoryInput, "scopeType" | "scopeId"> };

export function isAllowedEvalScope(record: ScopeRef, scope: EvalScope): boolean {
  if (record.scopeType === "project") return typeof scope.projectKey === "string" && scope.projectKey.trim().length > 0 && record.scopeId === scope.projectKey;
  if (record.scopeType === "user") return typeof scope.userScopeId === "string" && scope.userScopeId.trim().length > 0 && record.scopeId === scope.userScopeId;
  return false;
}

export function assertRetrievalCorpus(seeds: readonly SeedScope[], queries: unknown): asserts queries is EvalQuery[] {
  for (const entry of seeds) {
    requireText(entry.seedKey, "seed key"); requireText(entry.memory.scopeId, "seed scopeId");
    if (entry.memory.scopeType !== "project" && entry.memory.scopeType !== "user") throw new Error("invalid seed scopeType");
  }
  const byKey = new Map(seeds.map((entry) => [entry.seedKey, entry.memory]));
  if (byKey.size !== seeds.length) throw new Error("retrieval seed keys must be unique");
  if (!Array.isArray(queries)) throw new Error("retrieval queries must be an array");
  const ids = new Set<string>();
  const texts = new Set<string>();
  let userQueries = 0;
  let contrastQueries = 0;
  for (const value of queries) {
    const query = validateQuery(value, byKey);
    const normalized = query.query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (ids.has(query.id) || texts.has(normalized)) throw new Error("retrieval query IDs and texts must be unique");
    ids.add(query.id); texts.add(normalized);
    if (query.scope.userScopeId !== undefined) userQueries += 1;
    if (query.hardNegativeRecordSeedKeys !== undefined) contrastQueries += 1;
  }
  if (queries.length < 50) throw new Error("expanded retrieval corpus requires at least 50 unique queries");
  if (userQueries < 10) throw new Error("expanded retrieval corpus requires at least 10 actual user-positive queries");
  if (contrastQueries < 10) throw new Error("expanded retrieval corpus requires at least 10 in-scope hard-negative queries");
}

function validateQuery(value: unknown, seeds: ReadonlyMap<string, SeedScope["memory"]>): EvalQuery {
  if (typeof value !== "object" || value === null) throw new Error("retrieval query must be an object");
  const query = value as Record<string, unknown>;
  requireText(query.id, "query id"); requireText(query.query, "query text");
  if (query.queryLanguage !== undefined || query.memoryLanguage !== undefined) {
    for (const language of [query.queryLanguage, query.memoryLanguage]) {
      if (!["en", "ko", "ja", "zh"].includes(language as string)) throw new Error("query and memory languages must both be en, ko, ja, or zh");
    }
  }
  if (typeof query.scope !== "object" || query.scope === null) throw new Error("query scope is required");
  const scope = query.scope as EvalScope;
  requireText(scope.projectKey, "query projectKey");
  if (scope.userScopeId !== undefined) requireText(scope.userScopeId, "query userScopeId");
  requireKeys(query.relevantRecordSeedKeys);
  const positives = query.relevantRecordSeedKeys;
  const negatives = query.hardNegativeRecordSeedKeys;
  if (negatives !== undefined) requireKeys(negatives);
  for (const key of [...positives, ...(negatives ?? [])]) {
    const record = seeds.get(key);
    if (!record) throw new Error(`unknown retrieval seed key: ${key}`);
    if (!isAllowedEvalScope(record, scope)) throw new Error(`retrieval label outside requested scope: ${key}`);
  }
  if (negatives?.some((key) => positives.includes(key))) throw new Error("relevant and hard-negative labels must not overlap");
  if (scope.userScopeId !== undefined && !positives.some((key) => seeds.get(key)?.scopeType === "user" && seeds.get(key)?.scopeId === scope.userScopeId)) {
    throw new Error("user query must expect the requested user's memory");
  }
  return query as unknown as EvalQuery;
}

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be nonblank text`);
}

function requireKeys(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some((key) => typeof key !== "string" || !key.trim())) {
    throw new Error("retrieval labels must be nonempty unique seed keys");
  }
}
