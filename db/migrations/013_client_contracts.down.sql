-- Rollback for 013_client_contracts.sql — removes only the table it created.
-- The original contract columns on client_care were never changed, so the
-- previous behaviour comes back as it was.
DROP TABLE IF EXISTS client_contracts;
