-- 014_add_goal_run_close_note: persist close resolutions/reasons on goal runs.

ALTER TABLE goal_runs
  ADD COLUMN IF NOT EXISTS close_note TEXT;
