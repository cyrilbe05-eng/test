-- Migration 027: only NEW client accounts are held on the onboarding
-- questionnaire until they finish it. Accounts created from now on get
-- onboarding_required = 1; existing clients stay NULL (never held; they can
-- still fill it in from Onboarding). Undo with 027_onboarding_required.down.sql.
ALTER TABLE profiles ADD COLUMN onboarding_required INTEGER;
