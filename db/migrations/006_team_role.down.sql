-- Rollback for 006 (copywriters revert to plain editors)
ALTER TABLE profiles DROP COLUMN team_role;
