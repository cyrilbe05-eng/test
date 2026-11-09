-- ============================================================
-- Migration 015 — client onboarding questionnaire
--
-- Additive only: two NEW tables + two NEW optional columns on client_care
-- (a table added by migration 011). Undo with 015_client_onboarding.down.sql.
-- Run once (ALTER TABLE ADD COLUMN cannot be repeated).
--
-- onboarding_questions: editable from the admin Questions page.
--   type        text / short_text / choice / link / file
--               link and file answers are lists (several links / files)
--   options     choice only, JSON array of strings
--   packages    both / full_package / editing_only
--   admin_only  answer hidden from copywriters (why they signed, hesitation)
-- onboarding_answers: one row per client + question.
--   answer      text; choice = an option, or the typed text for "Other";
--               link = JSON array of URLs
--   file_url    file = JSON array of {key, name, size} (R2 keys)
-- client_care.onboarding_status: NULL = not started / in_progress / done.
--   No client_care row also means not started.
-- client_care.onboarding_done_at: set when the CLIENT finishes (not when an
--   admin marks a client done).
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_questions (
  id          TEXT PRIMARY KEY,
  section     TEXT NOT NULL,
  text        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'short_text', 'choice', 'link', 'file')),
  options     TEXT,
  required    INTEGER NOT NULL DEFAULT 1,
  admin_only  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  packages    TEXT NOT NULL DEFAULT 'both' CHECK (packages IN ('both', 'full_package', 'editing_only')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS onboarding_answers (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES onboarding_questions(id) ON DELETE CASCADE,
  answer       TEXT,
  file_url     TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_by   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (client_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_answers_client ON onboarding_answers(client_id);

ALTER TABLE client_care ADD COLUMN onboarding_status TEXT
  CHECK (onboarding_status IS NULL OR onboarding_status IN ('in_progress', 'done'));
ALTER TABLE client_care ADD COLUMN onboarding_done_at TEXT;

-- The 36 starting questions, in order.
INSERT OR IGNORE INTO onboarding_questions (id, section, text, type, options, required, admin_only, sort_order, packages) VALUES
  ('obq_01', 'Getting started', 'What''s your Instagram?', 'short_text', NULL, 1, 0, 10, 'both'),
  ('obq_02', 'Getting started', 'How did you first hear about us?', 'choice', '["Instagram","YouTube","Referral","Cold DM","Email","Other"]', 1, 0, 20, 'both'),
  ('obq_03', 'Getting started', 'If applicable, who referred you or what specific post/message led you to us?', 'text', NULL, 0, 0, 30, 'both'),
  ('obq_04', 'Getting started', 'What made you decide to work with us?', 'text', NULL, 1, 1, 40, 'both'),
  ('obq_05', 'Getting started', 'What was your biggest hesitation before signing?', 'text', NULL, 1, 1, 50, 'both'),
  ('obq_06', 'Your story', 'Where did you grow up, and what was your childhood like?', 'text', NULL, 1, 0, 60, 'full_package'),
  ('obq_07', 'Your story', 'How has your background or upbringing influenced who you are today?', 'text', NULL, 1, 0, 70, 'full_package'),
  ('obq_08', 'Your story', 'What are some of your current interests or passions outside of your business?', 'text', NULL, 1, 0, 80, 'full_package'),
  ('obq_09', 'Your story', 'Was there a key moment or experience that inspired you to start your brand or shaped your path?', 'text', NULL, 1, 0, 90, 'full_package'),
  ('obq_10', 'Your story', 'What do you love most about what you do?', 'text', NULL, 1, 0, 100, 'full_package'),
  ('obq_11', 'Your story', 'Are there any other life events or experiences you''d like to share that shaped who you are today?', 'text', NULL, 0, 0, 110, 'full_package'),
  ('obq_12', 'Your offer', 'What product(s) or service(s) do you currently offer, and who is your ideal client?', 'text', NULL, 1, 0, 120, 'full_package'),
  ('obq_13', 'Your offer', 'What exactly is your offer? (e.g. 1-1 coaching, weekly calls) Go into detail, imagine you''re onboarding us.', 'text', NULL, 1, 0, 130, 'full_package'),
  ('obq_14', 'Your offer', 'What does your customer get when they buy from you beyond the product itself? (e.g. confidence, time freedom, better health, peace of mind)', 'text', NULL, 1, 0, 140, 'full_package'),
  ('obq_15', 'Your offer', 'What makes your offer different from similar ones in your niche or market?', 'text', NULL, 1, 0, 150, 'full_package'),
  ('obq_16', 'Your offer', 'How does your offer make their life easier, better, or more enjoyable?', 'text', NULL, 1, 0, 160, 'full_package'),
  ('obq_17', 'Your offer', 'What transformation or result do most of your clients experience after buying?', 'text', NULL, 1, 0, 170, 'full_package'),
  ('obq_18', 'Your offer', 'What are your best results or proof points we can mention? (client wins, numbers, milestones)', 'text', NULL, 1, 0, 180, 'full_package'),
  ('obq_19', 'Your voice', 'How would your friends describe the way you talk, in 3 words?', 'text', NULL, 1, 0, 190, 'full_package'),
  ('obq_20', 'Your voice', 'Any words or phrases you say all the time?', 'text', NULL, 1, 0, 200, 'full_package'),
  ('obq_21', 'Your voice', 'Any words or phrases you''d never say?', 'text', NULL, 1, 0, 210, 'full_package'),
  ('obq_22', 'Your voice', 'What''s an opinion you have that most people in your industry would disagree with?', 'text', NULL, 1, 0, 220, 'full_package'),
  ('obq_23', 'Your voice', 'What topics could you talk about for an hour without notes?', 'text', NULL, 1, 0, 230, 'full_package'),
  ('obq_24', 'Your voice', 'What do people usually get wrong about your field?', 'text', NULL, 1, 0, 240, 'full_package'),
  ('obq_25', 'Your voice', 'What''s a story you find yourself telling over and over? (a client win, a failure, a turning point)', 'text', NULL, 1, 0, 250, 'full_package'),
  ('obq_26', 'Your voice', 'How do you want people to feel after watching your videos?', 'text', NULL, 1, 0, 260, 'full_package'),
  ('obq_27', 'Your voice', 'How much of your personal life are you comfortable showing? (family, travel, routine, gym...)', 'text', NULL, 1, 0, 270, 'full_package'),
  ('obq_28', 'Your style', 'If your brand were a person, how would you describe its personality?', 'text', NULL, 1, 0, 280, 'both'),
  ('obq_29', 'Your style', 'How would you describe the style you want for your content?', 'text', NULL, 1, 0, 290, 'both'),
  ('obq_30', 'Your style', 'Send at least 2-3 creators whose content or editing you like.', 'text', NULL, 1, 0, 300, 'both'),
  ('obq_31', 'Your style', 'What specifically do you like about their content?', 'text', NULL, 1, 0, 310, 'both'),
  ('obq_32', 'Your style', 'Send video styles you LIKE.', 'link', NULL, 1, 0, 320, 'both'),
  ('obq_33', 'Your style', 'Send video styles you DON''T LIKE.', 'link', NULL, 1, 0, 330, 'both'),
  ('obq_34', 'Your style', 'Anything we should avoid in your edits or scripts?', 'text', NULL, 1, 0, 340, 'both'),
  ('obq_35', 'Last step', 'Upload your logo, fonts, brand guidelines, or any SOPs/PDFs that would help us tailor your content.', 'file', NULL, 0, 0, 350, 'both'),
  ('obq_36', 'Last step', 'Is there anything else you''d like us to know before we get started?', 'text', NULL, 0, 0, 360, 'both');

-- MARK EXISTING (one-time): clients that already exist are not forced
-- through onboarding; they are marked done (without a finish date).
INSERT INTO client_care (client_id, onboarding_status)
SELECT id, 'done' FROM profiles WHERE role = 'client' AND true
ON CONFLICT (client_id) DO UPDATE SET onboarding_status = 'done'
WHERE client_care.onboarding_status IS NULL;
