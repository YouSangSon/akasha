-- 013_add_goal_runs: first-class goal runs (loop-engineering memory).
--
-- A goal run is one objective + its termination criteria + the ordered
-- iterations an agent takes toward it. Memories created during a run link
-- back via memory_records.goal_run_id; while the run is 'active' those
-- memories are pinned out of compaction (see src/compact/*).
--
-- Idempotent via CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
-- matching the rest of the migration set.

CREATE TABLE IF NOT EXISTS goal_runs (
  id                   BIGSERIAL    PRIMARY KEY,
  organization_id      TEXT         NOT NULL DEFAULT 'default',
  scope_type           TEXT         NOT NULL,
  scope_id             TEXT         NOT NULL,
  project_key          TEXT,
  goal                 TEXT         NOT NULL,
  termination_criteria TEXT,
  status               TEXT         NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','completed','abandoned')),
  iteration_count      INTEGER      NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS goal_run_iterations (
  id               BIGSERIAL    PRIMARY KEY,
  goal_run_id      BIGINT       NOT NULL REFERENCES goal_runs(id) ON DELETE CASCADE,
  organization_id  TEXT         NOT NULL DEFAULT 'default',
  iteration_index  INTEGER      NOT NULL,
  attempt          TEXT         NOT NULL,
  outcome          TEXT         NOT NULL
                   CHECK (outcome IN ('success','failure','partial')),
  summary          TEXT,
  error            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (goal_run_id, iteration_index)
);

ALTER TABLE memory_records
  ADD COLUMN IF NOT EXISTS goal_run_id BIGINT REFERENCES goal_runs(id);

CREATE INDEX IF NOT EXISTS idx_goal_runs_org_scope_status
  ON goal_runs (organization_id, scope_type, scope_id, status);

CREATE INDEX IF NOT EXISTS idx_goal_run_iterations_run
  ON goal_run_iterations (goal_run_id, iteration_index);

CREATE INDEX IF NOT EXISTS idx_memory_records_goal_run
  ON memory_records (goal_run_id)
  WHERE goal_run_id IS NOT NULL;
