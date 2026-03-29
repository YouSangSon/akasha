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
});
