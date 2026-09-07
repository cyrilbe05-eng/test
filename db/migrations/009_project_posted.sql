-- 009: "Posted" on projects
--
-- Migration 008 added posted to calendar_events, which only covers MANUAL
-- planning entries. But most entries on the calendar are generated from
-- projects ("Title — Approved ✓") and are not stored rows, so they had no way
-- to be marked. This adds the flag to the project itself, completing the
-- lifecycle: violet planned → blue in production → green approved → grey posted.

ALTER TABLE projects ADD COLUMN posted_at TEXT;
