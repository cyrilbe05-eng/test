-- 010: manager accounts
--
-- A manager is an ADMIN with two capabilities removed, so it is stored as
-- role='admin' plus admin_role='manager' rather than a new role value. The
-- app has ~30 `requireRole(profile,'admin')` checks; a separate role would
-- silently strip managers of all of them. This way they keep every admin
-- ability by default and we subtract only what should be off limits:
--   - creating accounts
--   - resetting other people's passwords
--   - deleting accounts (destructive: cascades to projects and R2 files)
-- Those are also precisely the privilege-escalation routes, which is why
-- they are enforced server-side, not just hidden in the UI.
--
-- NULL admin_role = full admin (all existing admins are unaffected).

ALTER TABLE profiles ADD COLUMN admin_role TEXT;
