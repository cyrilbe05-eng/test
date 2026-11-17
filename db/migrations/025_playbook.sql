-- ============================================================
-- Migration 025 — Playbook (short training videos for clients)
--
-- Additive only: five NEW tables, nothing existing changes. Undo with
-- 025_playbook.down.sql. Run once.
--
-- playbook_sections          sections, in order; audience 'all' (every
--                            client) or 'selected' (the clients listed in
--                            playbook_section_clients).
-- playbook_section_clients   which clients see a 'selected' section.
-- playbook_videos            a video: an uploaded file (R2, key under
--                            playbook/) or a YouTube / Loom link; optional
--                            description and thumbnail; draft or published.
-- playbook_attachments       files (R2) or links under a video, in order.
-- playbook_views             which client watched which video, and when.
-- ============================================================

CREATE TABLE IF NOT EXISTS playbook_sections (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_section_clients (
  section_id  TEXT NOT NULL REFERENCES playbook_sections(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, client_id)
);

CREATE TABLE IF NOT EXISTS playbook_videos (
  id             TEXT PRIMARY KEY,
  section_id     TEXT NOT NULL REFERENCES playbook_sections(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  source         TEXT NOT NULL CHECK (source IN ('upload', 'youtube', 'loom')),
  storage_key    TEXT,
  file_name      TEXT,
  file_size      INTEGER,
  mime_type      TEXT,
  external_url   TEXT,
  thumbnail_key  TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  created_by     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playbook_videos_section ON playbook_videos(section_id);

CREATE TABLE IF NOT EXISTS playbook_attachments (
  id           TEXT PRIMARY KEY,
  video_id     TEXT NOT NULL REFERENCES playbook_videos(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('file', 'link')),
  title        TEXT NOT NULL,
  url          TEXT,
  storage_key  TEXT,
  file_name    TEXT,
  file_size    INTEGER,
  mime_type    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playbook_attachments_video ON playbook_attachments(video_id);

CREATE TABLE IF NOT EXISTS playbook_views (
  video_id    TEXT NOT NULL REFERENCES playbook_videos(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  watched_at  TEXT NOT NULL,
  PRIMARY KEY (video_id, client_id)
);
