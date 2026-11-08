-- ============================================================
-- Migration 014 — copywriter ↔ client links + production plans
--
-- Additive only: two NEW tables. Undo with 014_production_plans.down.sql.
--
-- client_team_assignments: which copywriters look after which clients
-- (set by an admin in Client Care). Copywriters can only edit the plans of
-- clients they are assigned to.
--
-- production_plan_items: the plan of a (full package) contract — dated steps
-- owned by Pingu, the client or both. Some steps tick themselves:
--   footage_uploaded — the client uploads footage after the previous step
--   all_delivered    — delivered videos reach the contract's videos included
-- done_by = 'auto' for those; a person's id when ticked/unticked by hand.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_team_assignments (
  client_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_member_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (client_id, team_member_id)
);
CREATE INDEX IF NOT EXISTS idx_client_team_member ON client_team_assignments(team_member_id);

CREATE TABLE IF NOT EXISTS production_plan_items (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,                          -- YYYY-MM-DD
  title        TEXT NOT NULL,
  owner        TEXT NOT NULL DEFAULT 'pingu' CHECK (owner IN ('pingu', 'client', 'both')),
  done         INTEGER NOT NULL DEFAULT 0,
  done_at      TEXT,
  done_by      TEXT,                                   -- profile id, or 'auto'
  auto_rule    TEXT NOT NULL DEFAULT 'none' CHECK (auto_rule IN ('none', 'footage_uploaded', 'all_delivered')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_items_contract ON production_plan_items(contract_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_items_client   ON production_plan_items(client_id);
