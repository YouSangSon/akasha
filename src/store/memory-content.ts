export function assertNonBlankText(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${label} must contain non-whitespace text`);
  }
}

export function assertNonBlankMemoryContent(
  content: unknown,
): asserts content is string {
  assertNonBlankText(content, "memory content");
}
