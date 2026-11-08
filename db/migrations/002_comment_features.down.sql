-- ============================================================
-- Migration 002 DOWN — removes the comment-feature columns.
-- SQLite ≥3.35 (D1) supports DROP COLUMN. Data in these columns
-- is lost on rollback; core comment data is untouched.
--   wrangler d1 execute <db-name> --remote --file=db/migrations/002_comment_features.down.sql
-- ============================================================

ALTER TABLE timeline_comments DROP COLUMN resolved_at;
ALTER TABLE timeline_comments DROP COLUMN resolved_by;
ALTER TABLE timeline_comments DROP COLUMN resolved;
ALTER TABLE timeline_comments DROP COLUMN timestamp_end_sec;
ALTER TABLE timeline_comments DROP COLUMN edited_at;
