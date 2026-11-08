-- ============================================================
-- Migration 003 — status-change audit log (C1)
--
-- Append-only history of every project status transition, for
-- tracking editor work and billing. Additive only. Run:
--   wrangler d1 execute <db-name> --remote --file=db/migrations/003_status_history.sql
--
-- Deploy safety: the API writes history fire-and-forget — before
-- this migration runs, writes silently no-op and every existing
-- flow keeps working. The history view/export report a clear
-- "needs migration" error until applied.
-- ============================================================

CREATE TABLE IF NOT EXISTS status_history (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_status  TEXT,                          -- NULL for the backfilled first entry
  new_status  TEXT NOT NULL,
  actor_id    TEXT REFERENCES profiles(id),  -- NULL when system-generated/backfilled
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_status_history_project ON status_history(project_id);
CREATE INDEX IF NOT EXISTS idx_status_history_created ON status_history(created_at);

-- Backfill: current status of every existing project as its first entry,
-- stamped with the project's last update time.
INSERT INTO status_history (id, project_id, old_status, new_status, actor_id, created_at)
SELECT lower(hex(randomblob(16))), id, NULL, status, NULL, updated_at
FROM projects;
