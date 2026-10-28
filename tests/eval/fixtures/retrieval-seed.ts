import type { SeedEntry } from "./seed.js";

// Retrieval-only additions: the client A/B 14-entry seed contract remains unchanged.
function seed(seedKey: string, scopeType: "project" | "user", scopeId: string, content: string): SeedEntry {
  return { seedKey, memory: {
    scopeType, scopeId, ...(scopeType === "project" ? { projectKey: scopeId } : {}),
    memoryType: "fact", content,
    source: { scopeType, scopeId, sourceType: "document", sourceRef: `retrieval-v2/${seedKey}` },
  } };
}

export const ADDITIONAL_RETRIEVAL_SEEDS: readonly SeedEntry[] = [
  seed("alice.commit-language", "user", "alice", "Alice writes Git commit messages in Korean while keeping code identifiers in English."),
  seed("alice.date-format", "user", "alice", "Alice writes calendar dates in ISO 8601 format: YYYY-MM-DD."),
  seed("alice.time-zone", "user", "alice", "Alice uses the Asia/Seoul time zone for work logs and scheduled tasks."),
  seed("alice.line-endings", "user", "alice", "Alice requires LF line endings in source files and shell scripts."),
  seed("bob.response-language", "user", "bob", "Bob prefers English responses for technical discussions."),
  seed("bob.typescript-indent", "user", "bob", "Bob formats TypeScript using two spaces for indentation."),
  seed("bob.python-packages", "user", "bob", "Bob manages Python dependencies and virtual environments with uv."),
  seed("bob.python-tests", "user", "bob", "Bob writes Python unit tests with pytest and uses fixtures for setup."),
  seed("carol.interactive-shell", "user", "carol", "Carol uses zsh as her interactive terminal shell."),
  seed("carol.portable-scripts", "user", "carol", "Carol writes portable automation scripts for POSIX sh, independently of her interactive terminal shell."),
  seed("bob.time-zone", "user", "bob", "Bob uses UTC for work logs and scheduled tasks."),
  seed("bob.interactive-shell", "user", "bob", "Bob uses fish as his interactive terminal shell."),
  seed("carol.commit-language", "user", "carol", "Carol writes Git commit messages in English."),
  seed("alpha.readiness", "project", "project-alpha", "Readiness endpoint /readyz checks Postgres and the vector index before admitting traffic. A dependency failure marks the app unready."),
  seed("alpha.liveness", "project", "project-alpha", "Liveness endpoint /healthz reports whether the application process is alive. Liveness does not assess dependency readiness."),
  seed("alpha.backup-restore", "project", "project-alpha", "Disaster recovery restores an encrypted Postgres backup after canonical database loss. Vector snapshots alone cannot recover canonical rows."),
  seed("alpha.reindex-derived", "project", "project-alpha", "The reindex operation regenerates derived vector entries from retained Postgres chunks. Canonical rows must already exist."),
  seed("alpha.archive", "project", "project-alpha", "Archiving a memory keeps its canonical record and removes its derived vectors from search. Archival is reversible."),
  seed("alpha.unarchive", "project", "project-alpha", "Unarchiving a retained memory restores its search vectors without recreating canonical content."),
  seed("alpha.log-rotation", "project", "project-alpha", "Container log rotation caps each json-file log at 10 MB and retains at most three files."),
  seed("alpha.private-db-access", "project", "project-alpha", "Database and cache ports bind to loopback only. Operators access these private services through an SSH tunnel."),
  seed("alpha.ingest-retry", "project", "project-alpha", "Interrupted ingest jobs are claimed and retried with bounded exponential backoff after indexing outages. Retries preserve canonical memory rows."),
  seed("alpha.compaction-preview", "project", "project-alpha", "Compaction previews changes by default with dryRun=true. Archival is applied only when dryRun=false is explicitly supplied."),
  seed("alpha.secret-write-boundary", "project", "project-alpha", "Reject provider API keys and other detected secrets before writing memory content into canonical storage."),
  seed("alpha.token-org-binding", "project", "project-alpha", "A bearer token bound to one organization cannot switch tenants through a request header or body. Conflicting organization requests are denied."),
  seed("alpha.ingest-point-id", "project", "project-alpha", "Ingest retries reuse deterministic chunk point IDs so repeated attempts do not create duplicate vector entries."),
  seed("alpha.cli-audit-drain", "project", "project-alpha", "A CLI command drains its started audit writes before closing the database pool it owns. Long-lived server pools remain open."),
  seed("alpha.http-envelope", "project", "project-alpha", "JSON HTTP tool responses use a success boolean and a data object. Failures use success=false with error.message."),
  seed("alpha.mcp-native-result", "project", "project-alpha", "Native MCP tool responses contain content blocks and structuredContent. They do not use the JSON HTTP success/data envelope."),
  seed("alpha.body-limit", "project", "project-alpha", "An oversized JSON request body is rejected with HTTP 413 before tool dispatch. Raw request bodies are not logged."),
  seed("alpha.migration-order", "project", "project-alpha", "Apply database migrations in numeric filename order so each schema prerequisite exists before the next migration runs."),
  seed("beta.notifications", "project", "project-beta", "Beta delivers live update notifications over WebSockets. Its HTTP endpoints handle configuration."),
  seed("beta.app-port", "project", "project-beta", "The synthetic Beta deployment listens on application port 8081 behind its reverse proxy."),
  seed("beta.backup-retention", "project", "project-beta", "Beta retains encrypted database backups for seven days and tests restoration in an isolated environment."),
  seed("beta.migration-window", "project", "project-beta", "Beta applies schema migrations during a scheduled maintenance window before restarting application workers."),
  seed("beta.log-format", "project", "project-beta", "Beta emits structured JSON application logs with request IDs and excludes raw request bodies."),
];
