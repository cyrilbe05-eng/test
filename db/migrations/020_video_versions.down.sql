-- Rollback for 020_video_versions.sql — removes only what it added.
ALTER TABLE timeline_comments DROP COLUMN file_id;
ALTER TABLE project_files DROP COLUMN review_round;
