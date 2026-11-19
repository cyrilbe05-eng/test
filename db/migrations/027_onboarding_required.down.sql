-- Rollback for 027_onboarding_required.sql (nobody is held on onboarding after this).
ALTER TABLE profiles DROP COLUMN onboarding_required;
