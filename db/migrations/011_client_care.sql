-- ============================================================
-- Migration 011 — Client Care (admin-only CRM data)
--
-- Additive only: five NEW tables, no existing table or column is
-- touched. Undo with 011_client_care.down.sql.
--
-- Run against D1 (only when the operator decides to ship):
--   wrangler d1 execute <db-name> --remote --file=db/migrations/011_client_care.sql
--
-- Why client_care is its own table instead of new columns on profiles:
-- several existing endpoints return whole profile rows (SELECT *) to
-- clients (/api/profiles/me) and editors (/api/users/clients). Columns
-- added there would leak care notes and contract details to them.
--
-- Deploy safety: nothing existing reads these tables, so the app keeps
-- working whether or not this has run. Every foreign key to profiles or
-- projects cascades / nulls on delete, so existing user and project
-- deletion keeps working unchanged.
-- ============================================================

-- Contract, renewal and care fields per client (one row per client, created
-- lazily the first time something is saved; a missing row = all empty).
CREATE TABLE IF NOT EXISTS client_care (
  client_id       TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  contract_start  TEXT,                       -- YYYY-MM-DD
  contract_end    TEXT,                       -- YYYY-MM-DD
  videos_included INTEGER,                    -- per contract; NULL = not set
  renewal_status  TEXT NOT NULL DEFAULT 'not_discussed'
                    CHECK (renewal_status IN ('not_discussed', 'discussed', 'renewed', 'declined')),
  care_notes      TEXT,
  miro_url        TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- One row each time the admin ticks "Contacted".
CREATE TABLE IF NOT EXISTS client_contacts (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contacted_at  TEXT NOT NULL,
  contacted_by  TEXT REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id, contacted_at);

-- Onboarding checklist; each step is a date or NULL (not done).
CREATE TABLE IF NOT EXISTS client_onboarding (
  client_id              TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  welcome_sent           TEXT,
  call_done              TEXT,
  brief_received         TEXT,
  first_video_delivered  TEXT
);

-- Per-client recurring feedback, merged automatically from revision notes.
CREATE TABLE IF NOT EXISTS client_sop_rules (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category    TEXT NOT NULL
                CHECK (category IN ('pacing', 'captions', 'hook', 'music', 'colour', 'b-roll', 'branding', 'other')),
  text        TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_client_sop_rules_client ON client_sop_rules(client_id, category, archived);

-- One row per client revision note, created automatically from the client's
-- comments when they request a revision. comment_id links back to the source
-- timeline comment (and makes creation idempotent); category_source records
-- whether the category was picked automatically or corrected by the admin.
CREATE TABLE IF NOT EXISTS revision_entries (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  editor_id        TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  category         TEXT NOT NULL DEFAULT 'other'
                     CHECK (category IN ('pacing', 'captions', 'hook', 'music', 'colour', 'b-roll', 'branding', 'other')),
  category_source  TEXT NOT NULL DEFAULT 'auto' CHECK (category_source IN ('auto', 'manual')),
  note             TEXT NOT NULL,
  comment_id       TEXT UNIQUE,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  sop_rule_id      TEXT REFERENCES client_sop_rules(id) ON DELETE SET NULL,
  -- NULL = not yet categorised / merged into SOP rules. Entries are created
  -- instantly when a client requests a revision; the (model-based) processing
  -- runs later, server-side, so the client's request is never slowed down.
  processed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_revision_entries_client  ON revision_entries(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_revision_entries_project ON revision_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_revision_entries_editor  ON revision_entries(editor_id);
CREATE INDEX IF NOT EXISTS idx_revision_entries_pending ON revision_entries(processed_at);

-- BACKFILL (one-time): turn every PAST client revision note into a revision
-- entry, so SOP rules start from history instead of empty. A note counts when
-- the client actually submitted that round (round <= the project's revision
-- count). Editor = the editor assigned most recently. Safe to re-run
-- (comment_id is UNIQUE → already-imported notes are skipped).
INSERT OR IGNORE INTO revision_entries (id, project_id, client_id, editor_id, note, comment_id, created_at)
SELECT lower(hex(randomblob(16))), tc.project_id, p.client_id,
       (SELECT pa.team_member_id FROM project_assignments pa
        WHERE pa.project_id = tc.project_id ORDER BY pa.assigned_at DESC LIMIT 1),
       tc.comment_text, tc.id, tc.created_at
FROM timeline_comments tc
JOIN projects p ON p.id = tc.project_id
WHERE tc.author_role = 'client'
  AND tc.author_id = p.client_id
  AND tc.revision_round <= p.client_revision_count;
