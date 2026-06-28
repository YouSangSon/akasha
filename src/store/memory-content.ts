export function assertNonBlankMemoryContent(content: string): void {
  if (content.trim().length === 0) {
    throw new Error("memory content must contain non-whitespace text");
  }
}
