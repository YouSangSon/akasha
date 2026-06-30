import { describe, expect, it, vi, afterEach } from "vitest";
import { parseStoredPostgresSourceRef } from "../../src/store/memory-repository.js";
import * as loggerModule from "../../src/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseStoredPostgresSourceRef", () => {
  it("parses a valid JSON source_ref", () => {
    const value = JSON.stringify({ sourceRef: "README.md", uri: "file:///README.md" });
    const result = parseStoredPostgresSourceRef(value);
    expect(result).toEqual({ sourceRef: "README.md", uri: "file:///README.md" });
  });

  it("rejects non-string source_ref values before parsing", () => {
    const warnSpy = vi.spyOn(loggerModule.rootLogger, "warn");

    expect(() =>
      parseStoredPostgresSourceRef(123 as unknown as string),
    ).toThrow("sourceRef must be a string");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to raw value when JSON is invalid and logs a warning", () => {
    const warnSpy = vi.spyOn(loggerModule.rootLogger, "warn");
    const badValue = "not-json{{";

    const result = parseStoredPostgresSourceRef(badValue);

    expect(result).toEqual({ sourceRef: badValue, uri: null });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything(), valueLength: badValue.length }),
      expect.stringContaining("failed to parse source_ref JSON"),
    );
  });

  it("falls back to raw value when JSON is valid but sourceRef field is missing", () => {
    const warnSpy = vi.spyOn(loggerModule.rootLogger, "warn");
    const value = JSON.stringify({ uri: "file:///README.md" });

    const result = parseStoredPostgresSourceRef(value);

    expect(result).toEqual({ sourceRef: value, uri: null });
    // Missing sourceRef is a silent fallback (no JSON parse error thrown), no warning
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to raw value when JSON is a primitive", () => {
    const warnSpy = vi.spyOn(loggerModule.rootLogger, "warn");

    const result = parseStoredPostgresSourceRef("null");

    expect(result).toEqual({ sourceRef: "null", uri: null });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("treats a missing uri as null in valid JSON", () => {
    const value = JSON.stringify({ sourceRef: "doc.md" });
    const result = parseStoredPostgresSourceRef(value);
    expect(result).toEqual({ sourceRef: "doc.md", uri: null });
  });
});
