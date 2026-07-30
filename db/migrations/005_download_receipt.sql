-- 005: download receipt on deliverables
-- Records the first time the CLIENT downloaded an approved deliverable, so
-- the workspace can show a "Downloaded ✓" confirmation and the team can see
-- the handoff actually completed. Additive only.

ALTER TABLE project_files ADD COLUMN downloaded_at TEXT;
