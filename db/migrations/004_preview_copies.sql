-- 004: low-bitrate review copies for deliverables (zero-cost mobile playback)
-- A deliverable row can carry an optional second R2 object: a smaller
-- "review copy" encoded for slow connections. Clients stream the review copy
-- when present; the original stays the download/QC file. Additive only.

ALTER TABLE project_files ADD COLUMN preview_storage_key TEXT;
ALTER TABLE project_files ADD COLUMN preview_file_size INTEGER;
