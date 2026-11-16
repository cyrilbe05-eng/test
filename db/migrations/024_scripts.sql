-- ============================================================
-- Migration 024 — script-writing workspace (Scripts / Script Review)
--
-- Additive only: four NEW tables and two NEW optional columns on
-- calendar_events. Undo with 024_scripts.down.sql. Run once. Nothing
-- existing changes; the calendar works exactly as before without it.
--
-- script_pages      one page per client (the copywriter opens it).
-- script_groups     sections on a page ("M1", "M2"…), ordered.
-- scripts           one script (a toggle): title, type, script text (or
--                   carousel slides), caption, client notes, editor notes,
--                   inspo links, status. Each text has its own *_version that
--                   goes up on every save, so a save based on an older
--                   version is caught, not lost.
-- script_comments   comments on highlighted text (script or editor notes),
--                   with replies and resolve. Never shown to clients.
-- calendar_events.script_id     the script a calendar entry was pushed from.
-- calendar_events.editor_notes  instructions for editors; never sent to clients.
-- ============================================================

CREATE TABLE IF NOT EXISTS script_pages (
  client_id   TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS script_groups (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES script_pages(client_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_groups_client ON script_groups(client_id);

CREATE TABLE IF NOT EXISTS scripts (
  id                 TEXT PRIMARY KEY,
  group_id           TEXT NOT NULL REFERENCES script_groups(id) ON DELETE CASCADE,
  client_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  type               TEXT NOT NULL DEFAULT 'Reel' CHECK (type IN ('Reel', 'Carousel', 'Story', 'Post')),
  body_html          TEXT NOT NULL DEFAULT '',
  slides             TEXT,                        -- Carousel: JSON array of slide HTML, in order
  caption_html       TEXT NOT NULL DEFAULT '',
  client_notes_html  TEXT NOT NULL DEFAULT '',
  notes_html         TEXT NOT NULL DEFAULT '',
  links              TEXT NOT NULL DEFAULT '[]',  -- JSON array of URLs
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'in_review', 'needs_changes', 'approved', 'scheduled')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  body_version       INTEGER NOT NULL DEFAULT 0,
  caption_version    INTEGER NOT NULL DEFAULT 0,
  client_notes_version INTEGER NOT NULL DEFAULT 0,
  notes_version      INTEGER NOT NULL DEFAULT 0,
  in_review_at       TEXT,
  calendar_event_id  TEXT,
  created_by         TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_by         TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scripts_group ON scripts(group_id);
CREATE INDEX IF NOT EXISTS idx_scripts_client ON scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);

CREATE TABLE IF NOT EXISTS script_comments (
  id           TEXT PRIMARY KEY,
  script_id    TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  field        TEXT NOT NULL DEFAULT 'script' CHECK (field IN ('script', 'caption', 'client_notes', 'notes')),
  parent_id    TEXT REFERENCES script_comments(id) ON DELETE CASCADE,
  quote        TEXT,
  body         TEXT NOT NULL,
  author_id    TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at  TEXT,
  resolved_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_comments_script ON script_comments(script_id);

ALTER TABLE calendar_events ADD COLUMN script_id TEXT;
ALTER TABLE calendar_events ADD COLUMN editor_notes TEXT;
