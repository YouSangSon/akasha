-- Audit log of every tool invocation. PIPA-friendly: who did what, when, on
-- which org/project, and whether it succeeded. Inserts are append-only;
-- retention/rotation is a downstream concern (TTL job, partition drop).

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  tool TEXT NOT NULL,
  project_key TEXT,
  outcome TEXT NOT NULL,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookups: typically filtered by org (compliance reports), tool (diagnostics),
-- or actor (incident review). All ordered by recency.
CREATE INDEX IF NOT EXISTS idx_audit_log_org_recent
  ON audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_tool_recent
  ON audit_log (tool, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_recent
  ON audit_log (actor, created_at DESC);
