-- Rollback for 018_gallery_thumbnails.sql — removes only what it added.
-- Thumbnail images stay in R2 (under gallery-thumbs/), unused.
ALTER TABLE gallery_files DROP COLUMN thumb_key;
