-- ============================================================
-- Migration 022 — editor scoreboard (leaderboard + monthly bonus)
--
-- Additive only: three NEW tables, nothing existing changes. Undo with
-- 022_editor_scoreboard.down.sql. Run once. Until it runs, the scoreboard
-- still works on default settings (coefficient 1, 3h time target, no
-- adjustments, no bonus amount); only saving those settings needs it.
--
-- scoreboard_client_settings  per-client coefficient + time target. No row
--                             for a client = the defaults.
-- scoreboard_adjustments      admin points added to / removed from one
--                             video, with a reason the editor can see.
-- scoreboard_bonus            the winner's bonus amount for a month.
-- scoreboard_config           single settings, e.g. 'rulebook_url' (the
--                             scoring rulebook PDF editors can open).
-- ============================================================

CREATE TABLE IF NOT EXISTS scoreboard_client_settings (
  client_id         TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  coefficient       REAL NOT NULL DEFAULT 1.0,
  time_target_hours REAL NOT NULL DEFAULT 3,
  updated_at        TEXT NOT NULL,
  updated_by        TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scoreboard_adjustments (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  reason      TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scoreboard_bonus (
  month       TEXT PRIMARY KEY,          -- 'YYYY-MM'
  amount      REAL NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scoreboard_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);
