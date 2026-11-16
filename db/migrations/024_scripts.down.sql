-- Rollback for 024_scripts.sql — removes only what it added.
ALTER TABLE calendar_events DROP COLUMN editor_notes;
ALTER TABLE calendar_events DROP COLUMN script_id;
DROP TABLE IF EXISTS script_comments;
DROP TABLE IF EXISTS scripts;
DROP TABLE IF EXISTS script_groups;
DROP TABLE IF EXISTS script_pages;
