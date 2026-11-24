-- Migration 029: upload API for clients (API keys).
--
-- Additive only: four NEW tables, nothing existing is touched.
-- Undo with 029_upload_api.down.sql.
--
--   api_keys        one row per key. Only a SHA-256 hash of the key is
--                   stored; the full key is shown to the admin once.
--   api_key_events  what each key did (activity log shown to admins).
--   api_key_rate    request counter per key per minute (rate limit).
--   api_uploads     uploads made with a key: direct (in pieces) or from a
--                   link our server downloads. Becomes a project when done.

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT,
  revoked_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);

CREATE TABLE IF NOT EXISTS api_key_events (
  id         TEXT PRIMARY KEY,
  key_id     TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  action     TEXT NOT NULL,
  status     INTEGER NOT NULL,
  detail     TEXT,
  upload_id  TEXT,
  project_id TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_key_events_key ON api_key_events(key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_key_events_client ON api_key_events(client_id, created_at);

CREATE TABLE IF NOT EXISTS api_key_rate (
  key_id TEXT NOT NULL,
  minute TEXT NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (key_id, minute)
);

CREATE TABLE IF NOT EXISTS api_uploads (
  id              TEXT PRIMARY KEY,
  key_id          TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  kind            TEXT NOT NULL,            -- 'file' | 'link'
  status          TEXT NOT NULL,            -- uploading | queued | downloading | processing | done | failed | cancelled
  storage_key     TEXT,
  upload_id       TEXT,
  file_name       TEXT,
  file_size       INTEGER,
  mime_type       TEXT,
  part_size       INTEGER,
  part_count      INTEGER,
  parts_json      TEXT,                     -- link downloads: [{partNumber, etag}] so far
  bytes_done      INTEGER NOT NULL DEFAULT 0,
  source_url      TEXT,
  title           TEXT,
  instructions    TEXT,
  video_script    TEXT,
  inspiration_url TEXT,
  project_id      TEXT,
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  lease_until     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  finished_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_uploads_client ON api_uploads(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_uploads_status ON api_uploads(status, kind);
