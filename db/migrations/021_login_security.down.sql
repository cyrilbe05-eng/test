-- Rollback for 021_login_security.sql — removes only what it added.
DROP TABLE IF EXISTS login_attempts;
ALTER TABLE profiles DROP COLUMN sessions_valid_after;
