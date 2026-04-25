import { pino, destination as createDestination, type Logger } from "pino";

// MCP stdio transport uses stdout for JSON-RPC framing. Logs MUST go to stderr
// or the protocol stream gets corrupted and the client disconnects.
const destination = createDestination({ fd: 2, sync: false });

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

// Redact paths cover both top-level fields and nested objects so raw memory
// content / queries never leak into logs. Length-bearing companion fields like
// contentLength stay readable so retrieval debugging is still possible.
export const rootLogger: Logger = pino(
  {
    level,
    base: { service: "developer-memory-os" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "content",
        "query",
        "task",
        "packMarkdown",
        "input.content",
        "input.query",
        "input.task",
        "result.packMarkdown",
      ],
      censor: "[redacted]",
    },
  },
  destination,
);

export type RequestLoggerFields = {
  tool: string;
  projectKey?: string;
  scope?: string;
};

export function createRequestLogger(
  parent: Logger,
  fields: RequestLoggerFields,
): Logger {
  return parent.child({
    requestId: globalThis.crypto.randomUUID(),
    ...fields,
  });
}

export type { Logger };
