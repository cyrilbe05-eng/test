-- ============================================================
-- Migration 012 — Instagram accounts per client
--
-- Additive only: one NEW table, nothing existing is touched.
-- Undo with 012_client_instagram.down.sql.
--
-- A client can have several accounts. Handles are stored bare and lowercase
-- ("bloom.bakery", no "@"). Added by full admins (Create user form or the
-- Client Care panel); readable by admins and editors.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_instagram_accounts (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  handle      TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,   -- display order
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (client_id, handle)
);
CREATE INDEX IF NOT EXISTS idx_client_instagram_client ON client_instagram_accounts(client_id, position);
