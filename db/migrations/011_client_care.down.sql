-- Rollback for 011_client_care.sql — removes only the five tables it created.
-- WARNING: this deletes all Client Care data (contacts log, onboarding, notes,
-- revision entries, SOP rules). Existing tables are not touched.
-- revision_entries goes first because it references client_sop_rules.

DROP TABLE IF EXISTS revision_entries;
DROP TABLE IF EXISTS client_sop_rules;
DROP TABLE IF EXISTS client_onboarding;
DROP TABLE IF EXISTS client_contacts;
DROP TABLE IF EXISTS client_care;
