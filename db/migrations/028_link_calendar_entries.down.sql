-- Rollback for 028_link_calendar_entries.sql: unlinks exactly the entries it
-- linked (still pointing at the same project), then removes its record.
UPDATE calendar_events
SET project_id = NULL
WHERE id IN (SELECT b.event_id FROM calendar_link_backfill b WHERE b.project_id = calendar_events.project_id);

DROP TABLE IF EXISTS calendar_link_backfill;
