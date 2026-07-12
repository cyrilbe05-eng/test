-- ============================================================
-- Migration 003 DOWN — removes the status-history table.
-- All recorded history is lost on rollback; project data untouched.
--   wrangler d1 execute <db-name> --remote --file=db/migrations/003_status_history.down.sql
-- ============================================================

DROP INDEX IF EXISTS idx_status_history_created;
DROP INDEX IF EXISTS idx_status_history_project;
DROP TABLE IF EXISTS status_history;
