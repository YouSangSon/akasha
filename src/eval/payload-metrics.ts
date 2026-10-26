export type ToolPayloadBytes = {
  argumentsJsonUtf8Bytes?: number;
  resultJsonUtf8Bytes?: number;
  structuredContentJsonUtf8Bytes?: number;
  textContentUtf8Bytes?: number;
};

export function assertObservedPackBudget(value: unknown, maxOutputBytes: unknown): void {
  if (maxOutputBytes === undefined) return;
  if (typeof maxOutputBytes !== "number" || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) throw new Error("observed maxOutputBytes must be a positive safe integer");
  const pack = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const budget = typeof pack.budget === "object" && pack.budget !== null ? pack.budget as Record<string, unknown> : {};
  if (budget.maxOutputBytes !== maxOutputBytes || !Number.isSafeInteger(budget.omittedCount) || (budget.omittedCount as number) < 0) {
    throw new Error("client A/B observed context pack is missing matching budget metadata");
  }
  if ((jsonUtf8Bytes(value) ?? Infinity) > maxOutputBytes) throw new Error("client A/B observed context pack exceeds maxOutputBytes");
}

export function measureToolPayloadBytes(argumentsValue: unknown, resultValue: unknown): ToolPayloadBytes {
  const result = typeof resultValue === "object" && resultValue !== null && !Array.isArray(resultValue)
    ? resultValue as Record<string, unknown> : {};
  const content = result.content;
  const texts = typeof content === "string" ? [content] : Array.isArray(content)
    ? content.flatMap((block: unknown) => {
      if (typeof block !== "object" || block === null || !("type" in block) || block.type !== "text" || !("text" in block) || typeof block.text !== "string") return [];
      return [block.text];
    }) : undefined;
  // These views overlap; none allocates client-reported tokens to one tool call.
  return {
    argumentsJsonUtf8Bytes: jsonUtf8Bytes(argumentsValue),
    resultJsonUtf8Bytes: jsonUtf8Bytes(resultValue),
    structuredContentJsonUtf8Bytes: jsonUtf8Bytes(result.structured_content ?? result.structuredContent),
    textContentUtf8Bytes: texts?.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0),
  };
}

function jsonUtf8Bytes(value: unknown): number | undefined {
  const json = JSON.stringify(value);
  return json === undefined ? undefined : Buffer.byteLength(json, "utf8");
}
