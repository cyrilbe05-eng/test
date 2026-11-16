-- Rollback for 022_editor_scoreboard.sql — removes only what it added.
DROP TABLE IF EXISTS scoreboard_bonus;
DROP TABLE IF EXISTS scoreboard_adjustments;
DROP TABLE IF EXISTS scoreboard_client_settings;
