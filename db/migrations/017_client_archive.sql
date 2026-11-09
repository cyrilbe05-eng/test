-- ============================================================
-- Migration 017 — archive past clients
--
-- Additive only: one NEW optional column. Undo with 017_client_archive.down.sql.
-- Run once (ALTER TABLE ADD COLUMN cannot be repeated).
--
-- profiles.archived_at  set when an admin archives a client (who is also
--                       disabled: hidden everywhere, can't log in). Their
--                       projects and files stay, so stats stay correct.
--                       NULL = not archived. Restore clears it.
-- ============================================================

ALTER TABLE profiles ADD COLUMN archived_at TEXT;
