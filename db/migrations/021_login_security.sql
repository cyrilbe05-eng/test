-- ============================================================
-- Migration 021 — sign-in protection
--
-- Additive only: one NEW optional column and one NEW table. Undo with
-- 021_login_security.down.sql. Run once. Until it runs, sign-in works
-- exactly as before (no attempt limit, sessions not ended on password
-- change) — the code skips both when they are missing.
--
-- profiles.sessions_valid_after  sign-in tokens issued before this time are
--                                refused (set when a password is changed or
--                                reset). NULL = no cut-off.
-- login_attempts                 failed sign-ins per email / network address,
--                                to pause guessing after too many tries.
-- ============================================================

ALTER TABLE profiles ADD COLUMN sessions_valid_after TEXT;

CREATE TABLE IF NOT EXISTS login_attempts (
  key             TEXT PRIMARY KEY,   -- 'email:<address>' or 'ip:<address>'
  failures        INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT NOT NULL,
  locked_until    TEXT
);
