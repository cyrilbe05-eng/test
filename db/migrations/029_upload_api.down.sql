-- Rollback for 029_upload_api.sql: removes the upload API tables (all keys
-- stop working). Files already uploaded stay in their projects.
DROP TABLE IF EXISTS api_uploads;
DROP TABLE IF EXISTS api_key_rate;
DROP TABLE IF EXISTS api_key_events;
DROP TABLE IF EXISTS api_keys;
