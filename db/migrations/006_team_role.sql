-- 006: team sub-type (editor | copywriter)
--
-- Copywriters are team members with the SAME access as editors, plus the
-- ability to assign clients to calendar entries (previously admin-only).
-- Deliberately a sub-type column rather than a new value in profiles.role:
-- every existing `role = 'team'` permission check keeps working untouched.
-- NULL means editor (all pre-existing team members).

ALTER TABLE profiles ADD COLUMN team_role TEXT;
