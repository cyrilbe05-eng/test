-- Undo migration 030 (deadline reminders). Only removes the record of which
-- reminders were sent; deadlines and notifications are untouched.
DROP TABLE IF EXISTS deadline_reminders;
