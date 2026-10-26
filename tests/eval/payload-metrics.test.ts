import { describe, expect, it } from "vitest";
import { parseClaudeStream, parseCodexEvents } from "../../src/eval/client-ab.js";
import { buildContextPackResult } from "../../src/mcp/context-pack-result.js";
import { toToolResult } from "../../src/mcp/tool-result.js";
import type { SearchMemoryResult } from "../../src/types.js";

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const pack = { ok: true, packMarkdown: "한글 中文", selectedMemoryIds: ["project:p:1"] };

function codex(result: unknown, args: unknown = { x: "한" }) {
  const item = { type: "mcp_tool_call", status: "completed", error: null, server: "akasha", tool: "build_context_pack", arguments: args, result };
  return parseCodexEvents([
    { type: "item.started", item: { ...item, status: "in_progress", result: null } },
    { type: "item.completed", item },
    { type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 40 } },
  ].map((event) => JSON.stringify(event)).join("\n"));
}

function record(id: number, content: string, memoryType: SearchMemoryResult["memoryType"]): SearchMemoryResult {
  return {
    id, sourceId: id, scopeType: "project", scopeId: "p", memoryType, content,
    createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z",
    source: { id, scopeType: "project", scopeId: "p", sourceType: "document", title: "source", uri: null, createdAt: "2026-10-26T00:00:00Z" },
  };
}

describe("client payload byte observations", () => {
  it("counts completed calls once and keeps byte views separate from whole-turn tokens", () => {
    const text = JSON.stringify(pack, null, 2);
    const result = { structured_content: pack, content: [{ type: "text", text }] };
    const parsed = codex(result);
    expect(parsed.inputTokens).toBe(120);
    expect(parsed.cachedInputTokens).toBe(40);
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]).toHaveProperty("payloadBytes", {
      argumentsJsonUtf8Bytes: 11,
      resultJsonUtf8Bytes: jsonBytes(result),
      structuredContentJsonUtf8Bytes: jsonBytes(pack),
      textContentUtf8Bytes: Buffer.byteLength(text, "utf8"),
    });
  });

  it("records the text fallback without inventing structured-content bytes", () => {
    const text = JSON.stringify(pack);
    const result = { content: [{ type: "text", text }] };
    expect(codex(result).toolCalls[0]).toHaveProperty("payloadBytes", {
      argumentsJsonUtf8Bytes: 11,
      resultJsonUtf8Bytes: jsonBytes(result),
      structuredContentJsonUtf8Bytes: undefined,
      textContentUtf8Bytes: Buffer.byteLength(text, "utf8"),
    });
  });

  it("checks requested budgets against observed data rather than trusting the echoed arguments", () => {
    expect(() => codex({ structured_content: pack }, { maxOutputBytes: 4096 })).toThrow(/budget metadata/);
    const bounded = { ...pack, budget: { maxOutputBytes: 4096, omittedCount: 0 } };
    expect(codex({ content: [{ type: "text", text: JSON.stringify(bounded, null, 2) }] }, { maxOutputBytes: 4096 }).toolCalls[0]?.succeeded).toBe(true);
    expect(() => codex({ structured_content: { ...bounded, packMarkdown: "oversized ".repeat(1000) } }, { maxOutputBytes: 4096 })).toThrow(/exceeds maxOutputBytes/);
    expect(() => codex({ structured_content: { ...bounded, budget: { maxOutputBytes: 8192, omittedCount: 0 } } }, { maxOutputBytes: 4096 })).toThrow(/budget metadata/);
  });

  it("measures only the Claude result matched by tool-use ID", () => {
    const matched = { type: "tool_result", tool_use_id: "call-1", is_error: false, content: JSON.stringify(pack) };
    const events = [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "call-1", name: "mcp__akasha__build_context_pack", input: { x: "한" } }] } },
      { type: "user", message: { content: [{ ...matched, tool_use_id: "unrelated", content: "unrelated" }, matched] } },
      { type: "result", subtype: "success", is_error: false, modelUsage: { "claude-test": {} }, structured_output: { claims: {} }, usage: { input_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 3 } },
    ];
    const parsed = parseClaudeStream(events.map((event) => JSON.stringify(event)).join("\n"), "claude-test");
    expect(parsed.inputTokens).toBe(28);
    expect(parsed.toolCalls[0]).toHaveProperty("payloadBytes.resultJsonUtf8Bytes", jsonBytes(matched));
    expect(parsed.toolCalls[0]).toHaveProperty("payloadBytes.textContentUtf8Bytes", Buffer.byteLength(matched.content, "utf8"));
  });

  it("rejects an oversized Claude text-only budget result", () => {
    const oversized = { ...pack, packMarkdown: "oversized ".repeat(1000), budget: { maxOutputBytes: 4096, omittedCount: 0 } };
    const events = [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "call-1", name: "mcp__akasha__build_context_pack", input: { maxOutputBytes: 4096 } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "call-1", is_error: false, content: JSON.stringify(oversized) }] } },
      { type: "result", subtype: "success", is_error: false, modelUsage: { "claude-test": {} }, structured_output: { claims: {} }, usage: { input_tokens: 20 } },
    ];
    expect(() => parseClaudeStream(events.map((event) => JSON.stringify(event)).join("\n"), "claude-test")).toThrow(/exceeds maxOutputBytes/);
  });

  it("compares one bounded variant with the same controlled records and preserves required facts", () => {
    const input = { projectKey: "p", task: "continue", records: [
      record(1, "Decision: Postgres is canonical.", "decision"),
      record(2, "Constraint: never expose another organization.", "fact"),
      record(3, "Optional detail. ".repeat(2000), "fact"),
      record(4, "A short optional note.", "fact"),
    ] };
    const baseline = buildContextPackResult(input);
    const bounded = buildContextPackResult({ ...input, maxOutputBytes: 4096 });
    const observations = [baseline, bounded].map((result) => {
      const wire = toToolResult(result);
      return codex({ structured_content: wire.structuredContent, content: wire.content }, {
        projectKey: input.projectKey, task: input.task, includeUser: false,
        ...(result.budget === undefined ? {} : { maxOutputBytes: result.budget.maxOutputBytes }),
      }).toolCalls[0]!;
    });
    expect(bounded.selectedMemoryIds).toContain("project:p:1");
    expect(bounded.selectedMemoryIds).toContain("project:p:2");
    expect(jsonBytes(bounded)).toBeLessThanOrEqual(4096);
    expect(bounded.packMarkdown).toContain("Postgres is canonical.");
    expect(bounded.packMarkdown).toContain("never expose another organization.");
    expect(observations[0]).toHaveProperty("payloadBytes.structuredContentJsonUtf8Bytes", jsonBytes(baseline));
    expect(observations[1]).toHaveProperty("payloadBytes.structuredContentJsonUtf8Bytes", jsonBytes(bounded));
    expect(jsonBytes(bounded)).toBeLessThan(jsonBytes(baseline));
    console.info("context-budget-size-comparison", JSON.stringify({ profile: "controlled-in-memory-native-serialization", maxOutputBytes: 4096, baseline: observations[0].payloadBytes, bounded: observations[1].payloadBytes, selectedMemoryIds: bounded.selectedMemoryIds, modelTokensMeasured: false }));
  });
});
