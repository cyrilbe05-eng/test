-- Rollback for 004 (D1/SQLite 3.35+ supports DROP COLUMN)
ALTER TABLE project_files DROP COLUMN preview_storage_key;
ALTER TABLE project_files DROP COLUMN preview_file_size;
