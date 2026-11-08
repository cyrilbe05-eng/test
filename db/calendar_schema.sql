CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-indigo-500',
  content_type TEXT CHECK (content_type IN ('Reel', 'Story', 'Carousel', 'Post')),
  content_status TEXT CHECK (content_status IN ('Idea', 'Drafting', 'Scheduled')),
  comments TEXT,
  double_down INTEGER NOT NULL DEFAULT 0,
  inspiration_url TEXT,
  script TEXT,
  caption TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Join table: admin-assigned participants per event
CREATE TABLE IF NOT EXISTS calendar_event_participants (
  event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client', 'team')),
  PRIMARY KEY (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_evt_participants_event   ON calendar_event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_cal_evt_participants_profile ON calendar_event_participants(profile_id);

CREATE TABLE IF NOT EXISTS calendar_event_comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cal_evt_comments_event ON calendar_event_comments(event_id);

-- Migration helpers for existing databases:
-- ALTER TABLE calendar_events ADD COLUMN content_type TEXT CHECK (content_type IN ('Reel', 'Story', 'Carousel', 'Post'));
-- ALTER TABLE calendar_events ADD COLUMN content_status TEXT CHECK (content_status IN ('Idea', 'Drafting', 'Scheduled'));
-- ALTER TABLE calendar_events ADD COLUMN comments TEXT;
-- ALTER TABLE calendar_events ADD COLUMN double_down INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE calendar_events ADD COLUMN inspiration_url TEXT;
-- ALTER TABLE calendar_events ADD COLUMN script TEXT;
-- ALTER TABLE calendar_events ADD COLUMN caption TEXT;
