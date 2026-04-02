-- Seed default plans
-- Run after schema.sql
-- UUIDs are fixed so they can be referenced in app code if needed

INSERT OR IGNORE INTO plans (id, name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects) VALUES
  ('plan_starter', 'Starter', 1, 2,  20480,  1),   -- 20 GB, 1 active project
  ('plan_growth',  'Growth',  2, 4,  102400, 3),   -- 100 GB, 3 active projects
  ('plan_pro',     'Pro',     5, -1, -1,     -1);  -- unlimited
