-- Rollback for 014_production_plans.sql — removes only the two tables it created.
-- WARNING: deletes all production plans and copywriter ↔ client links.
DROP TABLE IF EXISTS production_plan_items;
DROP TABLE IF EXISTS client_team_assignments;
