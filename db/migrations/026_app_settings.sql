-- Migration 026: app-wide on/off switches set by full admins (Settings page).
-- First switch: batch_upload (clients' "Batch upload"). A missing row means
-- OFF, so nothing changes until an admin turns it on.
-- Undo with 026_app_settings.down.sql.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
