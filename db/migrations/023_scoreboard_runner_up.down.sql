-- Rollback for 023_scoreboard_runner_up.sql — removes only what it added.
ALTER TABLE scoreboard_bonus DROP COLUMN runner_up_amount;
