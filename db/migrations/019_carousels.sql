-- ============================================================
-- Migration 019 — carousels
--
-- Additive only: three NEW optional columns. Undo with
-- 019_carousels.down.sql. Run once.
--
-- projects.kind               'carousel' for carousel projects.
--                             NULL = video (every existing project).
-- project_files.sort_order    slide position (0, 1, 2…). NULL = no order.
-- timeline_comments.slide     slide number a comment is about (1-based).
--                             NULL = a video comment.
-- ============================================================

ALTER TABLE projects ADD COLUMN kind TEXT;
ALTER TABLE project_files ADD COLUMN sort_order INTEGER;
ALTER TABLE timeline_comments ADD COLUMN slide INTEGER;
