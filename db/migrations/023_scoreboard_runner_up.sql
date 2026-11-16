-- ============================================================
-- Migration 023 — second-place bonus on the editor leaderboard
--
-- Additive only: one NEW optional column. Undo with
-- 023_scoreboard_runner_up.down.sql. Run once, after 022. Until it runs,
-- the leaderboard works as before with a first-place bonus only.
--
-- scoreboard_bonus.runner_up_amount  bonus for the 2nd qualifying editor
--                                    that month. NULL = none.
-- ============================================================

ALTER TABLE scoreboard_bonus ADD COLUMN runner_up_amount REAL;
