-- Migration 030: deadline reminders for editors.
--
-- Additive only: one NEW table, nothing existing is touched.
-- Undo with 030_deadline_reminders.down.sql.
--
--   deadline_reminders  one row per reminder already sent for a deadline.
--                       The hourly reminder job adds the row BEFORE sending,
--                       and only sends when the row was new, so the same
--                       reminder can never go out twice.
--
--   kind: 'due_soon|<due_at>'      24 hours before the deadline
--         'overdue_<n>|<due_at>'   once when late (n = 0), then once per day late
--         'admin_overdue|<due_at>' to admins, once, when 2+ days late
--   (<due_at> is in the kind so moving a deadline arms its reminders again.)

CREATE TABLE IF NOT EXISTS deadline_reminders (
  deadline_id TEXT NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (deadline_id, kind)
);
