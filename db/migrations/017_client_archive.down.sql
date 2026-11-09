-- Rollback for 017_client_archive.sql — removes only what it added.
-- Archived clients stay disabled (they can't log in) but lose the
-- "archived" mark: re-enable them from Users if needed.
ALTER TABLE profiles DROP COLUMN archived_at;
