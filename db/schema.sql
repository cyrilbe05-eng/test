-- ============================================================
-- D1 Schema (SQLite-compatible)
-- Translated from supabase/migrations/001_initial_schema.sql
-- Differences from PostgreSQL:
--   - UUIDs stored as TEXT
--   - TIMESTAMPTZ -> TEXT (ISO 8601)
--   - ENUMs -> TEXT with CHECK constraints
--   - BIGINT -> INTEGER
--   - No triggers (replaced by application logic in API routes)
--   - No RLS (replaced by role checks in API routes)
--   - UUIDs generated in application code, not DB
-- ============================================================

-- ============================================================
-- PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  max_deliverables      INTEGER NOT NULL DEFAULT 1,
  max_client_revisions  INTEGER NOT NULL DEFAULT 2,
  storage_limit_mb      INTEGER NOT NULL DEFAULT 10240,  -- per-client storage cap in MB; -1 = unlimited
  max_active_projects   INTEGER NOT NULL DEFAULT -1,     -- -1 = unlimited
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- PROFILES
-- (id = Clerk user ID, e.g. "user_2NNEqL2nrIRdJ194ndJqow")
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id               TEXT PRIMARY KEY,
  role             TEXT NOT NULL CHECK (role IN ('admin', 'team', 'client')),
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,
  avatar_url       TEXT,
  plan_id          TEXT REFERENCES plans(id),
  client_id_label  TEXT,                                 -- admin-set free-form ID, e.g. "CLT-001"
  time_saved_hours REAL,                                 -- rolling hours-saved metric for clients
  password_changed INTEGER NOT NULL DEFAULT 0,           -- 0=false, 1=true
  disabled         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id                    TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL REFERENCES profiles(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  inspiration_url       TEXT,                            -- link to reference/inspiration video
  video_script          TEXT,                            -- multiline script provided by client
  status                TEXT NOT NULL DEFAULT 'pending_assignment'
                          CHECK (status IN (
                            'pending_assignment', 'in_progress', 'in_review',
                            'admin_approved', 'client_reviewing', 'client_approved',
                            'revision_requested'
                          )),
  instructions          TEXT,
  max_deliverables      INTEGER NOT NULL DEFAULT 1,
  max_client_revisions  INTEGER NOT NULL DEFAULT 2,
  client_revision_count INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- PROJECT FILES
-- ============================================================

CREATE TABLE IF NOT EXISTS project_files (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploader_id   TEXT NOT NULL REFERENCES profiles(id),
  file_type     TEXT NOT NULL CHECK (file_type IN ('source_video', 'deliverable', 'attachment')),
  storage_key   TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  approved      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- PROJECT ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS project_assignments (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_member_id  TEXT NOT NULL REFERENCES profiles(id),
  assigned_by     TEXT NOT NULL REFERENCES profiles(id),
  assigned_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(project_id, team_member_id)
);

-- ============================================================
-- DEADLINES
-- One per assignment. Auto-created 48h after assigned_at.
-- Admin can adjust due_at. Resolved as met or missed.
-- ============================================================

CREATE TABLE IF NOT EXISTS deadlines (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_member_id   TEXT NOT NULL REFERENCES profiles(id),
  assignment_id    TEXT NOT NULL REFERENCES project_assignments(id) ON DELETE CASCADE,
  due_at           TEXT NOT NULL,                        -- ISO datetime; defaults to assigned_at + 48h
  resolved_at      TEXT,                                 -- NULL while status = 'pending'
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'met', 'missed')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(assignment_id)                                  -- one deadline per assignment
);

-- ============================================================
-- TIMELINE COMMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_comments (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL REFERENCES profiles(id),
  author_role     TEXT NOT NULL CHECK (author_role IN ('admin', 'team', 'client')),
  timestamp_sec   REAL,
  comment_text    TEXT NOT NULL,
  revision_round  INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- TEAM NOTES
-- Private notes per team member on a project. Visible to admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS team_notes (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES profiles(id),
  timestamp_sec REAL,                                    -- optional video timestamp link
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL REFERENCES profiles(id),
  project_id    TEXT REFERENCES projects(id),
  type          TEXT NOT NULL CHECK (type IN (
                  'project_created', 'team_assigned', 'status_changed',
                  'comment_added', 'video_ready_for_review',
                  'revision_requested', 'project_approved', 'deadline_due'
                )),
  message       TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ============================================================
-- MIGRATION HELPERS
-- Run these manually in D1 console when upgrading an EXISTING database.
-- Safe to skip on a fresh schema deployment (all columns are in CREATE TABLE above).
-- ============================================================

-- ALTER TABLE plans      ADD COLUMN max_active_projects  INTEGER NOT NULL DEFAULT -1;
-- ALTER TABLE profiles   ADD COLUMN client_id_label      TEXT;
-- ALTER TABLE profiles   ADD COLUMN time_saved_hours     REAL;
-- ALTER TABLE projects   ADD COLUMN inspiration_url      TEXT;
-- ALTER TABLE projects   ADD COLUMN video_script         TEXT;
-- ALTER TABLE notifications ADD COLUMN type CHECK ... -- not possible in SQLite, skip for existing rows

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role           ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_projects_status         ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_client_id      ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project   ON project_files(project_id);
