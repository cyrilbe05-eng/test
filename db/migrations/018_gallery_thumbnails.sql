-- ============================================================
-- Migration 018 — gallery clip thumbnails
--
-- Additive only: one NEW optional column. Undo with
-- 018_gallery_thumbnails.down.sql. Run once.
--
-- gallery_files.thumb_key  R2 key of a small JPEG frame of the clip, made in
--                          the browser (on upload, or the first time the clip
--                          shows in the picker). NULL = none yet.
-- ============================================================

ALTER TABLE gallery_files ADD COLUMN thumb_key TEXT;
