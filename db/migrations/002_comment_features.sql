-- ============================================================
-- Migration 002 — comment features (B1 edit/delete, B2 ranges,
-- B3 revision checklist)
--
-- Additive only. Run against D1:
--   wrangler d1 execute <db-name> --remote --file=db/migrations/002_comment_features.sql
--
-- Deploy safety: the app tolerates this migration not having run —
-- existing point comments keep working; only the NEW actions
-- (edit, range comments, resolve) fail with a clear error until
-- the migration is applied.
-- ============================================================

-- B1: edited indicator
ALTER TABLE timeline_comments ADD COLUMN edited_at TEXT;

-- B2: optional range end; NULL = single-point comment (all existing rows)
ALTER TABLE timeline_comments ADD COLUMN timestamp_end_sec REAL;

-- B3: revision checklist state
ALTER TABLE timeline_comments ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE timeline_comments ADD COLUMN resolved_by TEXT REFERENCES profiles(id);
ALTER TABLE timeline_comments ADD COLUMN resolved_at TEXT;
