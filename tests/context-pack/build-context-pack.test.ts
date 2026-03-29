import { describe, expect, it } from "vitest";
import { buildContextPack } from "../../src/context-pack/build-context-pack.js";
import type { SearchMemoryResult } from "../../src/types.js";

type ResultOverrides = Partial<Omit<SearchMemoryResult, "source">> & {
  source?: Partial<SearchMemoryResult["source"]>;
};

function createResult(
  overrides: ResultOverrides,
): SearchMemoryResult {
  const scopeType = overrides.scopeType ?? "project";
  const scopeId = overrides.scopeId ?? "project-alpha";
  const sourceScopeType = overrides.source?.scopeType ?? scopeType;
  const sourceScopeId = overrides.source?.scopeId ?? scopeId;

  return {
    id: overrides.id ?? 1,
    sourceId: overrides.sourceId ?? 1,
    scopeType,
    scopeId,
    memoryType: overrides.memoryType ?? "summary",
    content: overrides.content ?? "Captured note.",
    createdAt: overrides.createdAt ?? "2026-03-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-20T10:00:00.000Z",
    source: {
      id: overrides.source?.id ?? 1,
      scopeType: sourceScopeType,
      scopeId: sourceScopeId,
      sourceType: overrides.source?.sourceType ?? "document",
      externalId: overrides.source?.externalId ?? "memory-1",
      title: overrides.source?.title ?? "Memory 1",
      uri: overrides.source?.uri ?? "file:///tmp/memory-1.md",
      createdAt:
        overrides.source?.createdAt ?? "2026-03-20T10:00:00.000Z",
    },
  };
}

describe("buildContextPack", () => {
  it("groups ranked records into structured sections and renders markdown", () => {
    const pack = buildContextPack({
      records: [
        createResult({
          id: 1,
          memoryType: "summary",
          content:
            "Project Alpha builds a local-first developer memory system for session handoff.",
          updatedAt: "2026-03-28T09:00:00.000Z",
          source: {
            sourceType: "document",
            externalId: "readme",
            title: "README",
            uri: "file:///tmp/README.md",
          },
        }),
        createResult({
          id: 2,
          memoryType: "decision",
          content:
            "Decision: Project memory should override user memory when both are available.",
          updatedAt: "2026-03-29T08:00:00.000Z",
          source: {
            sourceType: "decision",
            externalId: "adr-2",
            title: "Scope precedence",
            uri: "file:///tmp/adr-2.md",
          },
        }),
        createResult({
          id: 3,
          memoryType: "fact",
          content:
            "Constraint: Keep the memory store local-first until remote sync is designed.",
          updatedAt: "2026-03-27T08:00:00.000Z",
          source: {
            sourceType: "document",
            externalId: "constraint-1",
            title: "Constraints",
            uri: "file:///tmp/constraints.md",
          },
        }),
        createResult({
          id: 4,
          memoryType: "summary",
          content:
            "Open question: How should remote sync resolve conflicting project decisions?",
          updatedAt: "2026-03-26T08:00:00.000Z",
          source: {
            sourceType: "conversation",
            externalId: "session-2",
            title: "Session 2",
            uri: "file:///tmp/session-2.md",
          },
        }),
        createResult({
          id: 5,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Use ripgrep for fast repository search during debugging.",
          updatedAt: "2026-03-25T08:00:00.000Z",
          source: {
            scopeType: "user",
            scopeId: "alice",
            sourceType: "document",
            externalId: "tooling",
            title: "Tooling",
            uri: "file:///tmp/tooling.md",
          },
        }),
      ],
    });

    expect(pack.sections.project_summary).toEqual([
      expect.objectContaining({ id: 1 }),
    ]);
    expect(pack.sections.recent_decisions).toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
    expect(pack.sections.constraints).toEqual([
      expect.objectContaining({ id: 3 }),
    ]);
    expect(pack.sections.open_questions).toEqual([
      expect.objectContaining({ id: 4 }),
    ]);
    expect(pack.sections.relevant_notes).toEqual([
      expect.objectContaining({ id: 5 }),
    ]);

    expect(pack.markdown).toContain("## Project Summary");
    expect(pack.markdown).toContain(
      "Project Alpha builds a local-first developer memory system",
    );
    expect(pack.markdown).toContain("## Recent Decisions");
    expect(pack.markdown).toContain(
      "Project memory should override user memory",
    );
    expect(pack.markdown).toContain("## Constraints");
    expect(pack.markdown).toContain("Keep the memory store local-first");
    expect(pack.markdown).toContain("## Open Questions");
    expect(pack.markdown).toContain("How should remote sync resolve");
    expect(pack.markdown).toContain("## Relevant Notes");
    expect(pack.markdown).toContain("Use ripgrep for fast repository search");
  });

  it("caps each section and keeps the highest-ranked records in order", () => {
    const pack = buildContextPack({
      records: [
        createResult({
          id: 101,
          memoryType: "summary",
          content: "Latest project summary.",
          updatedAt: "2026-03-29T10:00:00.000Z",
        }),
        createResult({
          id: 102,
          memoryType: "summary",
          content: "Second-best project summary.",
          updatedAt: "2026-03-28T10:00:00.000Z",
        }),
        createResult({
          id: 103,
          memoryType: "summary",
          content: "Older summary that should be truncated.",
          updatedAt: "2026-03-27T10:00:00.000Z",
        }),
        createResult({
          id: 201,
          memoryType: "decision",
          content: "Decision: first retained decision.",
          updatedAt: "2026-03-29T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 202,
          memoryType: "decision",
          content: "Decision: second retained decision.",
          updatedAt: "2026-03-28T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 203,
          memoryType: "decision",
          content: "Decision: third retained decision.",
          updatedAt: "2026-03-27T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 204,
          memoryType: "decision",
          content: "Decision: fourth retained decision.",
          updatedAt: "2026-03-26T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 205,
          memoryType: "decision",
          content: "Decision: fifth retained decision.",
          updatedAt: "2026-03-25T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 206,
          memoryType: "decision",
          content: "Decision: overflow decision should be truncated.",
          updatedAt: "2026-03-24T09:00:00.000Z",
          source: { sourceType: "decision" },
        }),
        createResult({
          id: 301,
          memoryType: "fact",
          content: "Constraint: first retained constraint.",
          updatedAt: "2026-03-29T08:00:00.000Z",
        }),
        createResult({
          id: 302,
          memoryType: "fact",
          content: "Constraint: second retained constraint.",
          updatedAt: "2026-03-28T08:00:00.000Z",
        }),
        createResult({
          id: 303,
          memoryType: "fact",
          content: "Constraint: third retained constraint.",
          updatedAt: "2026-03-27T08:00:00.000Z",
        }),
        createResult({
          id: 304,
          memoryType: "fact",
          content: "Constraint: fourth retained constraint.",
          updatedAt: "2026-03-26T08:00:00.000Z",
        }),
        createResult({
          id: 305,
          memoryType: "fact",
          content: "Constraint: fifth retained constraint.",
          updatedAt: "2026-03-25T08:00:00.000Z",
        }),
        createResult({
          id: 306,
          memoryType: "fact",
          content: "Constraint: overflow constraint should be truncated.",
          updatedAt: "2026-03-24T08:00:00.000Z",
        }),
        createResult({
          id: 401,
          memoryType: "summary",
          content: "Open question: first retained question?",
          updatedAt: "2026-03-29T07:00:00.000Z",
        }),
        createResult({
          id: 402,
          memoryType: "summary",
          content: "Open question: second retained question?",
          updatedAt: "2026-03-28T07:00:00.000Z",
        }),
        createResult({
          id: 403,
          memoryType: "summary",
          content: "Open question: third retained question?",
          updatedAt: "2026-03-27T07:00:00.000Z",
        }),
        createResult({
          id: 404,
          memoryType: "summary",
          content: "Open question: fourth retained question?",
          updatedAt: "2026-03-26T07:00:00.000Z",
        }),
        createResult({
          id: 405,
          memoryType: "summary",
          content: "Open question: fifth retained question?",
          updatedAt: "2026-03-25T07:00:00.000Z",
        }),
        createResult({
          id: 406,
          memoryType: "summary",
          content: "Open question: overflow question should be truncated?",
          updatedAt: "2026-03-24T07:00:00.000Z",
        }),
        createResult({
          id: 501,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "First retained note.",
          updatedAt: "2026-03-29T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
        createResult({
          id: 502,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Second retained note.",
          updatedAt: "2026-03-28T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
        createResult({
          id: 503,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Third retained note.",
          updatedAt: "2026-03-27T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
        createResult({
          id: 504,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Fourth retained note.",
          updatedAt: "2026-03-26T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
        createResult({
          id: 505,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Fifth retained note.",
          updatedAt: "2026-03-25T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
        createResult({
          id: 506,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Overflow note should be truncated.",
          updatedAt: "2026-03-24T06:00:00.000Z",
          source: { scopeType: "user", scopeId: "alice" },
        }),
      ],
    });

    expect(pack.sections.project_summary.map((record) => record.id)).toEqual([
      101, 102,
    ]);
    expect(pack.sections.recent_decisions.map((record) => record.id)).toEqual([
      201, 202, 203, 204, 205,
    ]);
    expect(pack.sections.constraints.map((record) => record.id)).toEqual([
      301, 302, 303, 304, 305,
    ]);
    expect(pack.sections.open_questions.map((record) => record.id)).toEqual([
      401, 402, 403, 404, 405,
    ]);
    expect(pack.sections.relevant_notes.map((record) => record.id)).toEqual([
      501, 502, 503, 504, 505,
    ]);

    expect(pack.markdown).not.toContain("Older summary that should be truncated.");
    expect(pack.markdown).not.toContain(
      "overflow decision should be truncated.",
    );
    expect(pack.markdown).not.toContain(
      "overflow constraint should be truncated.",
    );
    expect(pack.markdown).not.toContain(
      "overflow question should be truncated?",
    );
    expect(pack.markdown).not.toContain("Overflow note should be truncated.");
  });

  it("renders multiline content as a compact single-line excerpt", () => {
    const pack = buildContextPack({
      records: [
        createResult({
          id: 601,
          memoryType: "fact",
          content: `Constraint:

- Keep local-first storage
- Avoid remote sync

Next step: validate migration paths.`,
          updatedAt: "2026-03-29T05:00:00.000Z",
        }),
      ],
    });

    expect(pack.markdown).toContain(
      "- Constraint: - Keep local-first storage - Avoid remote sync Next step: validate migration paths.",
    );
    expect(pack.markdown).not.toContain("\n- Keep local-first storage");
    expect(pack.markdown).not.toContain("Constraint:\n");
  });
});
