-- Migration 028: one-time link of OLD calendar entries to their video project,
-- only where it is certain. Entries made before calendar↔project linking
-- existed show twice on the calendar (the entry + the video) and appear on
-- the client's Home as "not filmed yet". An entry is linked when:
--   · it isn't linked yet,
--   · its client is clear (exactly one client on the entry, or a client owns it),
--   · exactly ONE project of that client has the same title (case and outer
--     spaces ignored),
--   · that project isn't linked to any other entry, and no other entry would
--     take it.
-- Every link made is recorded in calendar_link_backfill, so the undo
-- (028_link_calendar_entries.down.sql) removes exactly these links and nothing else.

CREATE TABLE IF NOT EXISTS calendar_link_backfill (
  event_id   TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  linked_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO calendar_link_backfill (event_id, project_id, linked_at)
WITH ev AS (
  SELECT e.id, lower(trim(e.title)) AS t,
    COALESCE(
      (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(cp.profile_id) END
         FROM calendar_event_participants cp WHERE cp.event_id = e.id AND cp.role = 'client'),
      (SELECT o.id FROM profiles o WHERE o.id = e.owner_id AND o.role = 'client')
    ) AS client_id
  FROM calendar_events e
  WHERE e.project_id IS NULL
),
cand AS (
  SELECT ev.id AS event_id, MAX(p.id) AS project_id
  FROM ev JOIN projects p ON p.client_id = ev.client_id AND lower(trim(p.title)) = ev.t
  WHERE ev.client_id IS NOT NULL
  GROUP BY ev.id
  HAVING COUNT(*) = 1
)
SELECT c.event_id, c.project_id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM cand c
WHERE NOT EXISTS (SELECT 1 FROM calendar_events x WHERE x.project_id = c.project_id)
  AND (SELECT COUNT(*) FROM cand c2 WHERE c2.project_id = c.project_id) = 1;

UPDATE calendar_events
SET project_id = (SELECT b.project_id FROM calendar_link_backfill b WHERE b.event_id = calendar_events.id)
WHERE project_id IS NULL
  AND id IN (SELECT event_id FROM calendar_link_backfill);
