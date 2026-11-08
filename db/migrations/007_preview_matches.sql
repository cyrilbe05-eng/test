-- PREVIEW ONLY — run this BEFORE 007 to see exactly which calendar entries
-- would be linked to which projects by the title backfill. Changes nothing.
SELECT
  e.title            AS entry_title,
  e.date             AS entry_date,
  p.title            AS project_title,
  p.status           AS project_status,
  c.full_name        AS client
FROM calendar_events e
JOIN projects p  ON p.title = e.title AND p.client_id = e.owner_id
JOIN profiles c  ON c.id = p.client_id
UNION
SELECT
  e.title, e.date, p.title, p.status, c.full_name
FROM calendar_events e
JOIN calendar_event_participants cep ON cep.event_id = e.id AND cep.role = 'client'
JOIN projects p  ON p.title = e.title AND p.client_id = cep.profile_id
JOIN profiles c  ON c.id = p.client_id
ORDER BY entry_date DESC;
