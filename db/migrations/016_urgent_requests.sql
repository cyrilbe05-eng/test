-- ============================================================
-- Migration 016 — editor "Request urgent"
--
-- Additive only: one NEW table. Undo with 016_urgent_requests.down.sql.
--
-- An editor at their active-project limit (settings: editors.maxActiveProjects)
-- asks to take one more project. Admins approve or decline from the
-- notification; an approved request lets that editor claim that one project.
--   status  pending → approved | declined;  approved → used once claimed
-- ============================================================

CREATE TABLE IF NOT EXISTS urgent_requests (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  editor_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined', 'used')),
  decided_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_urgent_requests_editor ON urgent_requests(editor_id, project_id);
CREATE INDEX IF NOT EXISTS idx_urgent_requests_status ON urgent_requests(status, created_at);
