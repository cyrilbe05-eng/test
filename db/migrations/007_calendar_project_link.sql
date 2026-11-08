-- 007: link calendar entries to projects, so an entry's colour tracks progress
--
-- A manual calendar entry (content planning) had no relationship to the project
-- it eventually became, so it stayed the colour the author picked forever.
-- With a link, the calendar can show lifecycle at a glance:
--   violet = planned / nothing delivered yet
--   blue   = a deliverable has been uploaded
--   green  = client approved
--
-- Additive. Entries with no linked project keep their author-chosen colour.

ALTER TABLE calendar_events ADD COLUMN project_id TEXT;

-- ── Retroactive backfill ────────────────────────────────────────────────────
-- Links historic entries to projects by EXACT title match for the same client.
-- Run the preview in 007_preview_matches.sql first to see what this will pair.
--
-- Pass 1: entry owned by the client the project belongs to.
UPDATE calendar_events
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.title = calendar_events.title
    AND p.client_id = calendar_events.owner_id
  ORDER BY p.created_at DESC LIMIT 1
)
WHERE project_id IS NULL
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.title = calendar_events.title
      AND p.client_id = calendar_events.owner_id
  );

-- Pass 2: entry created by admin/copywriter but assigned to that client.
UPDATE calendar_events
SET project_id = (
  SELECT p.id FROM projects p
  JOIN calendar_event_participants cep
    ON cep.profile_id = p.client_id AND cep.role = 'client'
  WHERE cep.event_id = calendar_events.id
    AND p.title = calendar_events.title
  ORDER BY p.created_at DESC LIMIT 1
)
WHERE project_id IS NULL
  AND EXISTS (
    SELECT 1 FROM projects p
    JOIN calendar_event_participants cep
      ON cep.profile_id = p.client_id AND cep.role = 'client'
    WHERE cep.event_id = calendar_events.id
      AND p.title = calendar_events.title
  );
