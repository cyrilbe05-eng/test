-- Rollback for 012_client_instagram.sql — removes only the table it created.
-- WARNING: deletes all saved Instagram handles. Nothing else is touched.
DROP TABLE IF EXISTS client_instagram_accounts;
