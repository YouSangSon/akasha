export function assertNonBlankText(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must contain non-whitespace text`);
  }
}

export function assertNonBlankMemoryContent(content: string): void {
  assertNonBlankText(content, "memory content");
}
