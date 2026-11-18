-- Rollback for 026_app_settings.sql: removes the switches (all back to OFF).
DROP TABLE IF EXISTS app_settings;
