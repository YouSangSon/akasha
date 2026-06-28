import { describe, expect, it } from "vitest";
import { resolveLogLevel } from "../src/logger.js";

describe("resolveLogLevel", () => {
  it("defaults to info in production", () => {
    expect(resolveLogLevel({ NODE_ENV: "production" })).toBe("info");
  });

  it("defaults to debug outside production", () => {
    expect(resolveLogLevel({})).toBe("debug");
  });

  it.each(["trace", "debug", "info", "warn", "error", "fatal", "silent"])(
    "accepts supported pino level %s",
    (level) => {
      expect(resolveLogLevel({ LOG_LEVEL: level })).toBe(level);
    },
  );

  it.each([
    ["TRACE", "trace"],
    ["DEBUG", "debug"],
    ["INFO", "info"],
    ["WARN", "warn"],
    ["ERROR", "error"],
    ["FATAL", "fatal"],
    ["SILENT", "silent"],
  ])("normalizes uppercase LOG_LEVEL value %s", (level, expected) => {
    expect(resolveLogLevel({ LOG_LEVEL: level })).toBe(expected);
  });

  it.each(["", " \n\t ", " info ", "verbose"])(
    "rejects invalid LOG_LEVEL value %s",
    (level) => {
      expect(() => resolveLogLevel({ LOG_LEVEL: level })).toThrow(
        `Invalid LOG_LEVEL: expected one of trace, debug, info, warn, error, fatal, silent, got ${JSON.stringify(level)}`,
      );
    },
  );
});
