-- Rollback for 015_client_onboarding.sql — removes only what it added.
-- WARNING: deletes all onboarding questions and answers. Uploaded onboarding
-- files stay in R2 (under onboarding/). client_care rows created by the
-- "mark existing" step stay, empty (the same as having no row).
DROP TABLE IF EXISTS onboarding_answers;
DROP TABLE IF EXISTS onboarding_questions;
ALTER TABLE client_care DROP COLUMN onboarding_done_at;
ALTER TABLE client_care DROP COLUMN onboarding_status;
