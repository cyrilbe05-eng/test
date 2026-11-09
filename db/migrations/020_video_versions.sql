-- ============================================================
-- Migration 020 — several versions of one video
--
-- Additive only: two NEW optional columns. Undo with
-- 020_video_versions.down.sql. Run once.
--
-- project_files.review_round review cycle a deliverable was uploaded in
--                           (1 + revisions requested before it). Files of
--                           the latest cycle are the versions the reviewer
--                           can switch between. NULL = uploaded before this.
-- timeline_comments.file_id the version a comment was made on.
--                           NULL = before this (applies to the project).
-- ============================================================

ALTER TABLE project_files ADD COLUMN review_round INTEGER;
ALTER TABLE timeline_comments ADD COLUMN file_id TEXT;
