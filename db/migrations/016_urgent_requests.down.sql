-- Rollback for 016_urgent_requests.sql — removes only what it added.
-- WARNING: deletes every urgent request (pending, approved and past ones).
DROP INDEX IF EXISTS idx_urgent_requests_status;
DROP INDEX IF EXISTS idx_urgent_requests_editor;
DROP TABLE IF EXISTS urgent_requests;
