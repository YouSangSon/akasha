import { describe, expect, it } from "vitest";
import { hardNegativeOrderingAtK } from "../../src/eval/metrics.js";
import { assertRetrievalCorpus, isAllowedEvalScope } from "../../src/eval/retrieval-corpus.js";
import { loadRetrievalCorpus } from "./fixtures/retrieval-corpus.js";

describe("contrast ordering and scope grading", () => {
  it.each([
    [[2, 1], 0], [[1, 2], 1], [[1], 1], [[2], 0], [[], 0], [[3, 2, 1], 0],
  ] as const)("grades ranks %s without rewarding an absent answer", (retrieved, expected) => {
    expect(hardNegativeOrderingAtK(retrieved, [1], [2], 5)).toBe(expected);
  });

  it("respects top-k and rejects invalid or overlapping negative labels", () => {
    expect(hardNegativeOrderingAtK([3, 1], [1], [2], 1)).toBe(0);
    expect(() => hardNegativeOrderingAtK([1], [1], [], 5)).toThrow(/empty/);
    expect(() => hardNegativeOrderingAtK([1], [1], [1], 5)).toThrow(/overlap/);
    expect(() => hardNegativeOrderingAtK([1], [1], [NaN], 5)).toThrow(/positive safe integer/);
    expect(() => hardNegativeOrderingAtK([1], [1], [2], 0)).toThrow(/positive integer/);
  });

  it("permits only the requested project and user, including when a user was not requested", () => {
    const scope = { projectKey: "p", userScopeId: "alice" };
    expect(isAllowedEvalScope({ scopeType: "project", scopeId: "p" }, scope)).toBe(true);
    expect(isAllowedEvalScope({ scopeType: "user", scopeId: "alice" }, scope)).toBe(true);
    expect(isAllowedEvalScope({ scopeType: "project", scopeId: "other" }, scope)).toBe(false);
    expect(isAllowedEvalScope({ scopeType: "user", scopeId: "bob" }, scope)).toBe(false);
    expect(isAllowedEvalScope({ scopeType: "user", scopeId: "alice" }, { projectKey: "p" })).toBe(false);
    expect(isAllowedEvalScope({ scopeType: "project", scopeId: "" }, { projectKey: "" })).toBe(false);
  });
});

describe("expanded retrieval corpus contract", () => {
  const corpus = loadRetrievalCorpus();

  it("keeps the historical 20 plus 32 distinct-topic questions with real user and contrast coverage", () => {
    expect(corpus.legacyQueries).toHaveLength(20);
    expect(corpus.expandedQueries).toHaveLength(32);
    expect(corpus.queries).toHaveLength(52);
    expect(corpus.queries.filter((q) => q.scope.userScopeId !== undefined)).toHaveLength(12);
    expect(corpus.queries.filter((q) => q.hardNegativeRecordSeedKeys !== undefined)).toHaveLength(12);
    expect(new Set(corpus.queries.flatMap((q) => q.scope.userScopeId ?? []))).toEqual(new Set(["alice", "bob", "carol"]));
  });

  it("rejects user labels that only tag a project answer or another user's record", () => {
    const tagged = corpus.queries.map((q) => q.id === "q01" ? { ...q, scope: { ...q.scope, userScopeId: "alice" } } : q);
    expect(() => assertRetrievalCorpus(corpus.seeds, tagged)).toThrow(/requested user's memory/);
    const wrongUser = corpus.queries.map((q) => q.id === "q08" ? { ...q, relevantRecordSeedKeys: ["bob.response-language"] } : q);
    expect(() => assertRetrievalCorpus(corpus.seeds, wrongUser)).toThrow(/outside requested scope/);
  });

  it("rejects out-of-scope, unknown and overlapping hard negatives", () => {
    for (const [key, message] of [["bob.response-language", /outside requested scope/], ["unknown", /unknown retrieval seed/], ["alpha.canonical-pg", /overlap/]] as const) {
      const mutated = corpus.queries.map((q) => q.id === "q01" ? { ...q, hardNegativeRecordSeedKeys: [key] } : q);
      expect(() => assertRetrievalCorpus(corpus.seeds, mutated)).toThrow(message);
    }
  });

  it("rejects duplicate text, IDs, missing labels and insufficient coverage", () => {
    expect(() => assertRetrievalCorpus(corpus.seeds, corpus.queries.slice(0, 20))).toThrow(/at least 50/);
    expect(() => assertRetrievalCorpus(corpus.seeds, [...corpus.queries, { ...corpus.queries[0]!, id: "duplicate-text" }])).toThrow(/unique/);
    expect(() => assertRetrievalCorpus(corpus.seeds, corpus.queries.map((q) => q.id === "q02" ? { ...q, id: "q01" } : q))).toThrow(/unique/);
    expect(() => assertRetrievalCorpus([...corpus.seeds, corpus.seeds[0]!], corpus.queries)).toThrow(/unique/);
    expect(() => assertRetrievalCorpus(corpus.seeds, null)).toThrow(/array/);
    expect(() => assertRetrievalCorpus(corpus.seeds, corpus.queries.map((q) => q.id === "q01" ? { ...q, relevantRecordSeedKeys: [] } : q))).toThrow(/nonempty/);
    const withoutUserPositives = corpus.queries.map((q) => q.scope.userScopeId === undefined ? q : {
      ...q, scope: { projectKey: "project-alpha" }, relevantRecordSeedKeys: ["alpha.canonical-pg"], hardNegativeRecordSeedKeys: undefined,
    });
    expect(() => assertRetrievalCorpus(corpus.seeds, withoutUserPositives)).toThrow(/actual user-positive/);
    expect(() => assertRetrievalCorpus(corpus.seeds, corpus.queries.map((q) => ({ ...q, hardNegativeRecordSeedKeys: undefined })))).toThrow(/in-scope hard-negative/);
  });

  it.each([null, {}, { id: "", query: "q", scope: { projectKey: "p" } }, { id: "q", query: "q", scope: null }])("rejects malformed query %# before any service is opened", (value) => {
    expect(() => assertRetrievalCorpus(corpus.seeds, [value, ...corpus.queries.slice(1)])).toThrow();
  });
});
