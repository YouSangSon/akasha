import { pino, destination as createDestination, type Logger } from "pino";

// MCP stdio transport uses stdout for JSON-RPC framing. Logs MUST go to stderr
// or the protocol stream gets corrupted and the client disconnects.
const destination = createDestination({ fd: 2, sync: false });

const SUPPORTED_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

export type LogLevel = (typeof SUPPORTED_LOG_LEVELS)[number];

export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = env.LOG_LEVEL;
  if (raw === undefined) {
    return env.NODE_ENV === "production" ? "info" : "debug";
  }
  const normalized = raw.toLowerCase();
  if ((SUPPORTED_LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as LogLevel;
  }
  throw new Error(
    `Invalid LOG_LEVEL: expected one of ${SUPPORTED_LOG_LEVELS.join(", ")}, got ${JSON.stringify(raw)}`,
  );
}

// Redact paths cover both top-level fields and nested objects so raw memory
// content / queries never leak into logs. Length-bearing companion fields like
// contentLength stay readable so retrieval debugging is still possible.
export const rootLogger: Logger = pino(
  {
    level: resolveLogLevel(),
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
